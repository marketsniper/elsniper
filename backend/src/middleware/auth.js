// Middlewares d'authentification / autorisation.
//
//  - requireAuth  : exige un JWT Bearer valide → req.auth = payload
//                   {phone, userId?, driverId?, hotelId?}, sinon 401.
//  - requireAdmin : exige le header X-Admin-Key === config.adminApiKey
//                   (équipe zanziGo), sinon 401 admin_required.
//  - isAdmin(req) : helper pour les routes "owner OU admin" — l'équipe
//                   zanziGo bypasse tous les contrôles d'ownership.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    // L'équipe zanziGo (clé admin valide) accède aux routes protégées sans
    // JWT : les contrôles d'ownership des routes la laissent passer via
    // isAdmin(req). Les routes qui exigent un profil précis (userId,
    // driverId...) restent inaccessibles sans jeton, clé admin ou pas.
    if (isAdmin(req)) {
      req.auth = { phone: null };
      return next();
    }
    return next(
      new HttpError(401, 'unauthorized', 'Jeton d\'authentification requis')
    );
  }
  try {
    req.auth = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(
      new HttpError(401, 'unauthorized', 'Jeton invalide ou expiré')
    );
  }

  // Hydratation : un client vérifie son identifiant PUIS crée son profil —
  // son jeton, émis avant la création, ne contient pas encore les ids.
  // On complète req.auth depuis la base (téléphone ou e-mail selon
  // l'identité du jeton).
  try {
    // (Les hôtels ne sont pas concernés : leur jeton, émis par hotel-login,
    // contient déjà hotelId — et leur téléphone n'est pas un identifiant.)
    if (req.auth.phone && (!req.auth.userId || !req.auth.driverId)) {
      const [u, d] = await Promise.all([
        req.auth.userId
          ? null
          : pool.query('SELECT id FROM users WHERE phone = $1', [req.auth.phone]),
        // Jeton local SANS code (sansOtp) : JAMAIS de pouvoirs chauffeur —
        // taper le numéro d'un chauffeur n'ouvre pas son espace.
        req.auth.driverId || req.auth.sansOtp
          ? null
          : pool.query('SELECT id FROM drivers WHERE phone = $1', [req.auth.phone]),
      ]);
      if (u?.rows[0]) req.auth.userId = u.rows[0].id;
      if (d?.rows[0]) req.auth.driverId = d.rows[0].id;
    }
    // Identité IDENTIFIANT (parcours client actuel) : le compte qui porte
    // ce nom d'utilisateur — jamais de profil chauffeur par identifiant.
    if (req.auth.username && !req.auth.userId) {
      const u = await pool.query('SELECT id FROM users WHERE lower(username) = lower($1)', [
        req.auth.username,
      ]);
      if (u.rows[0]) req.auth.userId = u.rows[0].id;
    }
    // Identité E-MAIL (touristes/visiteurs) : compte client le plus récent
    // portant cet e-mail — jamais de profil chauffeur par e-mail.
    if (req.auth.email && !req.auth.userId) {
      const u = await pool.query(
        `SELECT id FROM users WHERE lower(email) = lower($1) ORDER BY created_at DESC LIMIT 1`,
        [req.auth.email]
      );
      if (u.rows[0]) req.auth.userId = u.rows[0].id;
    }
  } catch (err) {
    return next(err);
  }
  next();
}

// Vrai si la requête vient de l'équipe zanziGo (clé admin valide)
export function isAdmin(req) {
  return req.headers['x-admin-key'] === config.adminApiKey;
}

export function requireAdmin(req, _res, next) {
  if (!isAdmin(req)) {
    return next(
      new HttpError(401, 'admin_required', 'Clé d\'administration requise')
    );
  }
  next();
}
