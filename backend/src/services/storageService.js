// Stockage des fichiers uploadés.
//
// Deux modes :
//  - S3 : si S3_BUCKET + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY sont définis,
//    upload vers un stockage S3 compatible (AWS S3, Cloudflare R2 via
//    S3_ENDPOINT...). Clé : uploads/<uuid>.<ext>. URL publique construite
//    depuis S3_PUBLIC_URL (ou l'URL standard du bucket).
//  - LOCAL (dev) : écrit dans backend/uploads/ (servi statiquement par
//    Express sur /uploads) et retourne une URL absolue localhost.
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

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

// Stocke un buffer et retourne son URL publique.
export async function storeFile({ buffer, mimeType }) {
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

  // ----- MODE LOCAL (dev) -----
  await mkdir(localUploadsDir, { recursive: true });
  const filename = path.basename(key);
  await writeFile(path.join(localUploadsDir, filename), buffer);
  return {
    url: `http://localhost:${config.port}/uploads/${filename}`,
    key,
  };
}
