// Applique les migrations SQL de db/migrations/ dans l'ordre alphabétique.
// Les migrations déjà appliquées (table schema_migrations) sont ignorées.
//
// Deux protections, apprises du terrain :
//
//  - CHAQUE MIGRATION ET SON ENREGISTREMENT DANS LA MÊME TRANSACTION. Sans
//    ça, une coupure entre les deux (redéploiement Render, connexion perdue)
//    laissait une migration appliquée mais non enregistrée : au démarrage
//    suivant elle était rejouée, échouait (« type already exists ») et le
//    serveur ne redémarrait PLUS JAMAIS sans intervention SQL manuelle.
//    C'est exactement ce que fait déjà test/setup.js — le même modèle ici.
//
//  - UN VERROU CONSULTATIF POSTGRES. Pendant un déploiement, l'ancienne et
//    la nouvelle instance peuvent se chevaucher ; sans verrou, les deux
//    rejouaient les mêmes fichiers en même temps et la seconde plantait.
//    pg_advisory_lock sérialise : la seconde attend, voit tout appliqué,
//    ne fait rien.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'migrations'
);

// Numéro arbitraire mais FIXE : tous les processus doivent demander le même.
const VERROU_MIGRATIONS = 727272;

async function main() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [VERROU_MIGRATIONS]);

    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
    );

    const applied = new Set(
      (await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name)
    );

    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`= ${file} (déjà appliquée)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
      console.log(`+ ${file} appliquée`);
    }

    await client.query('SELECT pg_advisory_unlock($1)', [VERROU_MIGRATIONS]);
  } finally {
    client.release();
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
