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

// POST /api/auth/request-otp {phone}
// Génère un code 6 chiffres (crypto), stocke son hash (sha256) avec une
// expiration de 10 min, invalide les codes précédents non consommés du
// même numéro, puis envoie le SMS.
// COMPORTEMENT DEV : si NODE_ENV !== "production", la réponse contient
// devCode (le code en clair) pour permettre les tests automatisés —
// jamais en production.
authRouter.post('/request-otp', async (req, res, next) => {
  try {
    const { phone } = z.object({ phone: phoneSchema }).parse(req.body);

    // Code à 6 chiffres cryptographiquement aléatoire (000000–999999)
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

    await withTransaction(async (client) => {
      // Invalider (consommer) les codes précédents non consommés du même numéro
      await client.query(
        `UPDATE otp_codes SET consumed_at = now()
         WHERE phone = $1 AND consumed_at IS NULL`,
        [phone]
      );
      await client.query(
        `INSERT INTO otp_codes (phone, code_hash, expires_at)
         VALUES ($1, $2, now() + interval '${OTP_TTL_MINUTES} minutes')`,
        [phone, hashCode(code)]
      );
    });

    await smsService.sendOtp(phone, code);

    const body = { sent: true, expiresInMinutes: OTP_TTL_MINUTES };
    // Exposé hors production, ou si le mode pilote est activé
    // (OTP_EXPOSE_DEV_CODE=1) : tant qu'aucun vrai fournisseur SMS n'est
    // branché, le code s'affiche dans l'app pour permettre les tests.
    // À DÉSACTIVER dès que les SMS réels sont en place.
    if (config.env !== 'production' || config.exposeOtpDevCode) {
      body.devCode = code;
    }
    res.status(200).json(body);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/verify-otp {phone, code}
// Vérifie le code (hash + non expiré + non consommé), le consomme, puis
// signe un JWT. Réponse : {token, user, driver, hotel} — chacun null si
// aucun profil n'existe encore pour ce numéro.
authRouter.post('/verify-otp', async (req, res, next) => {
  try {
    const { phone, code } = z
      .object({
        phone: phoneSchema,
        code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres requis'),
      })
      .parse(req.body);

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
      [phone, hashCode(code)]
    );
    if (rows.length === 0) {
      throw new HttpError(401, 'invalid_otp', 'Code OTP invalide ou expiré');
    }

    // Profils éventuels rattachés à ce numéro. Les hôtels ne se connectent
    // PAS par téléphone : voir POST /auth/hotel-login (email + mot de passe).
    const [userRes, driverRes] = await Promise.all([
      pool.query('SELECT * FROM users WHERE phone = $1', [phone]),
      pool.query('SELECT * FROM drivers WHERE phone = $1', [phone]),
    ]);
    const user = userRes.rows[0] || null;
    const driver = driverRes.rows[0] || null;

    const payload = { phone };
    if (user) payload.userId = user.id;
    if (driver) payload.driverId = driver.id;

    const token = jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.json({ token, user, driver, hotel: null });
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
