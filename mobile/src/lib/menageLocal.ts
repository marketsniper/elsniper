// « Faire le ménage » : masque, sur CE téléphone uniquement, les éléments
// terminés ou annulés antérieurs au dernier coup de balai. Rien n'est
// supprimé chez zanziGo — l'historique officiel (gains des chauffeurs,
// tableau de bord équipe, comptabilité) reste complet. On ne stocke que
// l'horodatage du coup de balai, par liste et par propriétaire.
import { ecrireStockage, lireStockage } from './stockage';

function cle(espace: string, proprietaireId: string): string {
  // SecureStore n'accepte que [A-Za-z0-9._-] dans les clés.
  return `zanzigo_balai_${espace}_${proprietaireId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

/** Horodatage (ms) du dernier coup de balai — 0 si jamais passé. */
export async function lireCoupDeBalai(espace: string, proprietaireId: string): Promise<number> {
  try {
    const brut = await lireStockage(cle(espace, proprietaireId));
    const valeur = brut ? Number(brut) : 0;
    return Number.isFinite(valeur) ? valeur : 0;
  } catch {
    return 0;
  }
}

/** Passe le coup de balai maintenant et renvoie l'horodatage enregistré. */
export async function passerCoupDeBalai(espace: string, proprietaireId: string): Promise<number> {
  const maintenant = Date.now();
  await ecrireStockage(cle(espace, proprietaireId), String(maintenant));
  return maintenant;
}

/** Vrai si l'élément (créé à dateIso) est antérieur au coup de balai. */
export function estBalaye(dateIso: unknown, balai: number): boolean {
  if (!balai) return false;
  const quand = new Date(String(dateIso ?? '')).getTime();
  return Number.isFinite(quand) && quand < balai;
}
