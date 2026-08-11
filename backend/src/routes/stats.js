import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /stats — compteurs d'abonnés pour le tableau de bord équipe :
// clients (touristes + résidents), locaux, hôtels et chauffeurs vérifiés.
// Réservé à l'équipe (X-Admin-Key).
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [{ rows: parType }, { rows: hotels }, { rows: drivers }] = await Promise.all([
      query('SELECT account_type, COUNT(*)::int AS n FROM users GROUP BY account_type'),
      query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE verification_status = 'verified')::int AS verifies
         FROM hotels`
      ),
      query(
        `SELECT COUNT(*) FILTER (WHERE verification_status = 'verified')::int AS verifies
         FROM drivers`
      ),
    ]);
    const n = (type) => parType.find((ligne) => ligne.account_type === type)?.n ?? 0;
    res.json({
      tourists: n('tourist'),
      residents: n('resident'),
      locals: n('local'),
      // « Clients » au sens du tableau de bord : visiteurs USD
      // (touristes + résidents), les locaux étant comptés à part.
      clients: n('tourist') + n('resident'),
      hotels: hotels[0].total,
      hotels_verified: hotels[0].verifies,
      drivers_verified: drivers[0].verifies,
    });
  })
);

export default router;
