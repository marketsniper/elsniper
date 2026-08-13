// Authentification zanziGo → JWT.
//
// Clients et chauffeurs (OTP SMS) :
//   POST /request-otp {phone} → SMS avec un code 6 chiffres →
//   POST /verify-otp {phone, code} → {token, user, driver}.
//   Un nouveau venu vérifie d'abord son téléphone, PUIS crée son profil
//   (POST /users ou /drivers avec le même phone que le jeton).
// Hôtels partenaires (email + mot de passe) :
//   POST /hotel-login {email, password} → {token, hotel}.
import crypto from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, withTransaction } from '../db.js';
import { HttpError } from '../errors.js';
import * as smsService from '../services/smsService.js';
import { emailCodeOtp, envoyerEmail, isEmailStub } from '../services/emailService.js';
import { verifyPassword } from '../services/passwordService.js';
import { sanitizeHotel } from './hotels.js';

export const authRouter = Router();

const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Numéro au format international requis (ex. +255777123456)');

const OTP_TTL_MINUTES = 10;

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// Masque un e-mail pour l'afficher sans le révéler : a***@g***.com
function masquerEmail(email) {
  const [local, domaine] = email.split('@');
  const point = domaine.lastIndexOf('.');
  return `${local[0]}***@${domaine[0]}***${point > 0 ? domaine.slice(point) : ''}`;
}

// POST /api/auth/request-otp {phone, channel?, email?}
// Génère un code 6 chiffres (crypto), stocke son hash (sha256) avec une
// expiration de 10 min, invalide les codes précédents non consommés du
// même numéro, puis l'ENVOIE :
//  - channel 'sms' (défaut) : SMS via l'opérateur (Africa's Talking) ;
//  - channel 'email' : par e-mail — le remède aux touristes à l'étranger
//    qui ne reçoivent pas de SMS en itinérance. SÉCURITÉ : pour un compte
//    EXISTANT, le code part UNIQUEMENT vers l'e-mail enregistré sur le
//    compte (jamais vers un e-mail fourni à la volée — sinon n'importe qui
//    pourrait se faire livrer le code d'autrui) ; un numéro encore inconnu
//    peut recevoir son code sur l'e-mail de son choix (création de compte).
// COMPORTEMENT DEV : si NODE_ENV !== "production", la réponse contient
// devCode (le code en clair) pour permettre les tests automatisés —
// jamais en production.
// IDENTITÉ E-MAIL (touristes/visiteurs) : sans téléphone du tout, l'e-mail
// EST l'identifiant du compte — {email} seul suffit, le code part dans la
// boîte mail. Les locaux et chauffeurs s'identifient toujours par téléphone.
authRouter.post('/request-otp', async (req, res, next) => {
  try {
    const { phone, channel, email } = z
      .object({
        phone: phoneSchema.optional(),
        channel: z.enum(['sms', 'email']).optional(),
        email: z.string().email().optional(),
      })
      .refine((d) => d.phone || d.email, {
        path: ['phone'],
        message: 'Fournir un téléphone ou un e-mail',
      })
      .parse(req.body);

    // Identifiant du code : le téléphone, ou l'e-mail normalisé (identité
    // e-mail des visiteurs — jamais de collision, un e-mail n'est pas un
    // numéro).
    const identiteEmail = !phone;
    const identifiant = phone ?? email.toLowerCase();

    // Destinataire e-mail éventuel, déterminé AVANT de créer le code.
    let destinataireEmail = null;
    if (identiteEmail) {
      destinataireEmail = email.toLowerCase();
    } else if (channel === 'email') {
      const { rows } = await pool.query('SELECT email FROM users WHERE phone = $1 LIMIT 1', [
        phone,
      ]);
      if (rows[0]) {
        if (!rows[0].email) {
          throw new HttpError(
            409,
            'email_unavailable',
            "Ce compte n'a pas d'adresse e-mail enregistrée — utilisez le SMS ou contactez l'équipe sur WhatsApp"
          );
        }
        destinataireEmail = rows[0].email;
      } else {
        if (!email) {
          throw new HttpError(400, 'email_required', 'Indiquez votre adresse e-mail pour y recevoir le code');
        }
        destinataireEmail = email;
      }
    }

    // Code à 6 chiffres cryptographiquement aléatoire (000000–999999)
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

    await withTransaction(async (client) => {
      // Invalider (consommer) les codes précédents du même identifiant
      await client.query(
        `UPDATE otp_codes SET consumed_at = now()
         WHERE phone = $1 AND consumed_at IS NULL`,
        [identifiant]
      );
      await client.query(
        `INSERT INTO otp_codes (phone, code_hash, expires_at)
         VALUES ($1, $2, now() + interval '${OTP_TTL_MINUTES} minutes')`,
        [identifiant, hashCode(code)]
      );
    });

    if (destinataireEmail) {
      const { subject, html } = emailCodeOtp(code);
      await envoyerEmail({ to: destinataireEmail, subject, html });
    } else {
      await smsService.sendOtp(phone, code);
    }

    const body = { sent: true, expiresInMinutes: OTP_TTL_MINUTES };
    if (destinataireEmail) {
      body.channel = 'email';
      body.emailMasked = masquerEmail(destinataireEmail);
    }
    // Exposé hors production, ou si le mode pilote est activé
    // (OTP_EXPOSE_DEV_CODE=1) — mais JAMAIS quand le vrai canal d'envoi est
    // branché : dès que les SMS réels (Africa's Talking) ou les e-mails
    // réels (Brevo/Resend) partent, le code n'apparaît plus dans l'app.
    const canalStub = destinataireEmail ? isEmailStub() : smsService.isSmsStub();
    if (config.env !== 'production' || (config.exposeOtpDevCode && canalStub)) {
      body.devCode = code;
    }
    res.status(200).json(body);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/verify-otp {phone?, email?, code}
// Vérifie le code (hash + non expiré + non consommé), le consomme, puis
// signe un JWT. Identité téléphone (locaux, chauffeurs) OU identité e-mail
// (touristes/visiteurs). Réponse : {token, user, driver, hotel} — chacun
// null si aucun profil n'existe encore pour cet identifiant.
authRouter.post('/verify-otp', async (req, res, next) => {
  try {
    const { phone, email, code } = z
      .object({
        phone: phoneSchema.optional(),
        email: z.string().email().optional(),
        code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres requis'),
      })
      .refine((d) => d.phone || d.email, {
        path: ['phone'],
        message: 'Fournir un téléphone ou un e-mail',
      })
      .parse(req.body);

    const identifiant = phone ?? email.toLowerCase();

    const { rows } = await pool.query(
      `UPDATE otp_codes SET consumed_at = now()
       WHERE id = (
         SELECT id FROM otp_codes
         WHERE phone = $1 AND code_hash = $2
           AND consumed_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC
         LIMIT 1
       )
       RETURNING id`,
      [identifiant, hashCode(code)]
    );
    if (rows.length === 0) {
      throw new HttpError(401, 'invalid_otp', 'Code OTP invalide ou expiré');
    }

    if (phone) {
      // Identité TÉLÉPHONE (locaux, chauffeurs, anciens comptes). Les hôtels
      // ne se connectent pas par téléphone : POST /auth/hotel-login.
      const [userRes, driverRes] = await Promise.all([
        pool.query('SELECT * FROM users WHERE phone = $1', [phone]),
        pool.query('SELECT * FROM drivers WHERE phone = $1', [phone]),
      ]);
      const user = userRes.rows[0] || null;
      const driver = driverRes.rows[0] || null;

      const payload = { phone };
      if (user) payload.userId = user.id;
      if (driver) payload.driverId = driver.id;

      const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
      return res.json({ token, user, driver, hotel: null });
    }

    // Identité E-MAIL (touristes/visiteurs) : le compte client le plus
    // récent portant cet e-mail — jamais de profil chauffeur par e-mail.
    const userRes = await pool.query(
      `SELECT * FROM users WHERE lower(email) = $1 ORDER BY created_at DESC LIMIT 1`,
      [identifiant]
    );
    const user = userRes.rows[0] || null;

    const payload = { email: identifiant };
    if (user) payload.userId = user.id;

    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    res.json({ token, user, driver: null, hotel: null });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/hotel-login {email, password}
// Connexion des hôtels partenaires — email + mot de passe (pas d'OTP).
// Réponse : {token, hotel}. Échec → 401 invalid_credentials (sans préciser
// si c'est l'email ou le mot de passe qui est en cause).
authRouter.post('/hotel-login', async (req, res, next) => {
  try {
    const { email, password } = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(req.body);

    const { rows } = await pool.query('SELECT * FROM hotels WHERE email = lower($1)', [email]);
    const hotel = rows[0];
    const valid = hotel && (await verifyPassword(password, hotel.password_hash));
    if (!valid) {
      throw new HttpError(401, 'invalid_credentials', 'Email ou mot de passe incorrect');
    }

    const token = jwt.sign({ hotelId: hotel.id, email: hotel.email }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.json({ token, hotel: sanitizeHotel(hotel) });
  } catch (err) {
    next(err);
  }
});
