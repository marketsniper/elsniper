// Hachage des mots de passe (comptes hôtels) — scrypt natif de Node,
// aucun paquet supplémentaire. Format stocké : scrypt:<sel>:<hash>.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split(':');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const derived = await scrypt(password, salt, 64);
  const attendu = Buffer.from(hash, 'hex');
  // Longueurs différentes (hash tronqué ou corrompu en base) :
  // timingSafeEqual LÈVE au lieu de renvoyer false — ce serait un 500 sur
  // l'écran de connexion là où la seule bonne réponse est « refusé ».
  if (attendu.length !== derived.length) return false;
  return crypto.timingSafeEqual(attendu, derived);
}
