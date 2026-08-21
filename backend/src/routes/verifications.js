/**
 * LA FILE DE VÉRIFICATION — tous les dossiers en attente, au même endroit.
 *
 * Le problème qu'elle règle. Trois familles de dossiers demandent l'œil d'un
 * humain avant d'ouvrir un droit : un chauffeur (permis, assurance, véhicule,
 * pièce d'identité) avant de recevoir des courses ; un client local ou
 * résident (carte NIDA, justificatif) avant d'obtenir le tarif du pays ; un
 * hôtel avant d'accéder au compte partenaire. Jusqu'ici, il fallait aller les
 * chercher dans trois listes différentes du tableau de bord, ouvrir chaque
 * fiche, ouvrir chaque document. À quelques dossiers par jour, c'est la
 * corvée qui traîne — et un chauffeur qui attend trois jours sa validation
 * est un chauffeur qui va voir ailleurs.
 *
 * Ce que fait cette route : elle empile tout, LE PLUS ANCIEN D'ABORD, avec
 * les documents déjà rassemblés et le temps d'attente calculé. L'application
 * n'a plus qu'à afficher la photo et deux boutons.
 *
 * Ce qu'elle ne fait PAS : décider. La validation reste sur les routes
 * existantes (PATCH /drivers/:id/verify, /users/:id/verify, /hotels/:id/verify)
 * qui portent chacune leurs propres effets — génération du QR véhicule,
 * fermeture des annonces d'un chauffeur radié, alerte au chauffeur validé.
 * Dupliquer ces effets ici aurait créé deux vérités.
 */
import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

const heuresDepuis = (date) =>
  Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 36e5));

/** Une pièce jointe à contrôler ; les cases vides sont écartées. */
const pieces = (...paires) =>
  paires.filter(([, url]) => !!url).map(([libelle, url]) => ({ libelle, url }));

/** Une ligne d'information à lire à côté du document. */
const infos = (...paires) =>
  paires.filter(([, valeur]) => valeur !== null && valeur !== undefined && valeur !== '')
    .map(([label, valeur]) => ({ label, valeur: String(valeur) }));

// GET /verifications — la file complète (équipe).
//
// Chaque famille est bornée à 100 dossiers (l'inscription hôtel est
// publique : sans borne, une rafale de fausses inscriptions ferait
// construire un tableau géant en mémoire à chaque ouverture de l'écran).
// Un seul aller-retour : l'écran de vérification n'a pas à interroger trois
// routes ni à recoller les morceaux. Le tri met en tête le dossier qui attend
// depuis le plus longtemps — c'est celui qui coûte le plus cher.
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [chauffeurs, clients, hotels] = await Promise.all([
      query(
        `SELECT id, full_name, phone, zone, license_number, vehicle_plate, vehicle_model,
                license_document_url, insurance_document_url, vehicle_photo_url,
                id_document_url, license_expires_on, insurance_expires_on, created_at
           FROM drivers
          WHERE verification_status = 'pending' AND archived_at IS NULL
          ORDER BY created_at ASC
          LIMIT 100`
      ),
      // Les touristes n'ont RIEN à faire ici : leur tarif ne dépend d'aucun
      // document. Seuls les locaux (carte NIDA) et les résidents (titre de
      // séjour) demandent un contrôle, et seulement s'ils ont déposé la pièce.
      query(
        `SELECT id, full_name, phone, email, account_type, id_document_url, created_at
           FROM users
          WHERE verification_status = 'pending'
            AND account_type IN ('local', 'resident')
            AND id_document_url IS NOT NULL
            AND banned_at IS NULL
          ORDER BY created_at ASC
          LIMIT 100`
      ),
      query(
        `SELECT id, name, contact_name, phone, zone, address, created_at
           FROM hotels
          WHERE verification_status = 'pending'
          ORDER BY created_at ASC
          LIMIT 100`
      ),
    ]);

    const dossiers = [
      ...chauffeurs.rows.map((d) => ({
        type: 'chauffeur',
        id: d.id,
        nom: d.full_name,
        contact: d.phone,
        depuis: d.created_at,
        heures_attente: heuresDepuis(d.created_at),
        documents: pieces(
          ['Permis de conduire', d.license_document_url],
          ['Assurance', d.insurance_document_url],
          ['Photo du véhicule', d.vehicle_photo_url],
          ["Pièce d'identité", d.id_document_url]
        ),
        infos: infos(
          ['Téléphone', d.phone],
          ['Zone', d.zone],
          ['N° de permis', d.license_number],
          ['Plaque', d.vehicle_plate],
          ['Véhicule', d.vehicle_model],
          ['Permis valable jusqu’au', d.license_expires_on],
          ['Assurance valable jusqu’au', d.insurance_expires_on]
        ),
      })),
      ...clients.rows.map((u) => ({
        type: 'client',
        id: u.id,
        nom: u.full_name,
        contact: u.phone || u.email,
        depuis: u.created_at,
        heures_attente: heuresDepuis(u.created_at),
        documents: pieces([
          u.account_type === 'local' ? 'Carte d’identité tanzanienne (NIDA)' : 'Justificatif de résidence',
          u.id_document_url,
        ]),
        infos: infos(
          ['Type de compte', u.account_type === 'local' ? 'Local (tarif en shillings)' : 'Résident (−5 %)'],
          ['Téléphone', u.phone],
          ['E-mail', u.email]
        ),
      })),
      ...hotels.rows.map((h) => ({
        type: 'hotel',
        id: h.id,
        nom: h.name,
        contact: h.phone,
        depuis: h.created_at,
        heures_attente: heuresDepuis(h.created_at),
        // Un hôtel ne dépose aucune pièce : le contrôle se fait en appelant le
        // numéro officiel de l'établissement. L'écran le dit noir sur blanc
        // plutôt que d'afficher une zone de document vide.
        documents: [],
        verification_par_telephone: true,
        infos: infos(
          ['Contact', h.contact_name],
          ['Téléphone', h.phone],
          ['Zone', h.zone],
          ['Adresse', h.address]
        ),
      })),
    ].sort((a, b) => new Date(a.depuis) - new Date(b.depuis));

    res.json({
      total: dossiers.length,
      par_type: {
        chauffeur: chauffeurs.rows.length,
        client: clients.rows.length,
        hotel: hotels.rows.length,
      },
      dossiers,
    });
  })
);

export default router;
