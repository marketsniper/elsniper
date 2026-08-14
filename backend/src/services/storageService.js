// Stockage des fichiers uploadés (permis, assurance, photo véhicule, carte
// NIDA…).
//
// Trois modes, dans cet ordre :
//  - S3 : si S3_BUCKET + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY sont définis,
//    upload vers un stockage S3 compatible (AWS S3, Cloudflare R2 via
//    S3_ENDPOINT...). URL publique construite depuis S3_PUBLIC_URL.
//  - BASE DE DONNÉES (défaut) : le fichier est écrit dans la table
//    uploaded_files et servi par GET /api/uploads/:id. C'est le mode de
//    production : le disque du serveur est remis à zéro à chaque
//    déploiement (documents perdus) et l'URL disque pointait sur
//    « localhost », donc inouvrable depuis un téléphone. La base, elle,
//    est persistante et l'URL renvoyée est publique et absolue.
//  - LOCAL : uniquement quand la base n'est pas joignable (tests hors DB).
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { query } from '../db.js';

const hasS3 = Boolean(
  config.s3.bucket && config.s3.accessKeyId && config.s3.secretAccessKey
);

// Répertoire local de fallback (dev) : backend/uploads/
export const localUploadsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'uploads'
);

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

let s3Client = null;
async function getS3Client() {
  if (s3Client) return s3Client;
  // Import dynamique : le SDK n'est chargé qu'en mode S3
  const { S3Client } = await import('@aws-sdk/client-s3');
  s3Client = new S3Client({
    region: config.s3.region,
    ...(config.s3.endpoint ? { endpoint: config.s3.endpoint } : {}),
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
    },
  });
  return s3Client;
}

/**
 * Stocke un buffer et retourne son URL publique.
 * baseUrl : origine publique du serveur (ex. https://zanzigo-api.onrender.com),
 * déduite de la requête — indispensable pour que le lien s'ouvre depuis
 * n'importe quel téléphone.
 */
export async function storeFile({ buffer, mimeType, baseUrl }) {
  const ext = EXT_BY_MIME[mimeType] || 'bin';
  const key = `uploads/${crypto.randomUUID()}.${ext}`;

  if (hasS3) {
    // ----- MODE S3 / R2 -----
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    );
    const base = config.s3.publicUrl
      ? config.s3.publicUrl.replace(/\/$/, '')
      : `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com`;
    return { url: `${base}/${key}`, key };
  }

  // ----- MODE BASE DE DONNÉES (défaut en production) -----
  const racine = (baseUrl || config.publicBaseUrl || '').replace(/\/$/, '');
  try {
    const { rows } = await query(
      `INSERT INTO uploaded_files (mime_type, size, data) VALUES ($1, $2, $3) RETURNING id`,
      [mimeType, buffer.length, buffer]
    );
    return { url: `${racine}/api/uploads/${rows[0].id}`, key: rows[0].id };
  } catch (err) {
    // Base indisponible : repli disque (développement hors base).
    await mkdir(localUploadsDir, { recursive: true });
    const filename = path.basename(key);
    await writeFile(path.join(localUploadsDir, filename), buffer);
    return { url: `${racine || `http://localhost:${config.port}`}/uploads/${filename}`, key };
  }
}

/** Récupère un fichier stocké en base (null si inconnu). */
export async function readFile(id) {
  const { rows } = await query(
    'SELECT mime_type, size, data FROM uploaded_files WHERE id = $1',
    [id]
  );
  return rows[0] ?? null;
}
