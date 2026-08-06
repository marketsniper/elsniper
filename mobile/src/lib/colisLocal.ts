// Mémorisation locale d'identifiants (SecureStore), par propriétaire.
// - Colis : l'API n'expose pas de liste des colis d'un utilisateur (seuls les
//   hôtels ont GET /hotels/:id/packages) → on garde les ids créés depuis ce
//   téléphone et on recharge chaque colis via GET /packages/:id.
// - Courses chauffeur : pas de liste côté API non plus → on garde les ids de
//   courses récemment ouvertes par le chauffeur.
import * as SecureStore from 'expo-secure-store';

function cle(espace: string, proprietaireId: string): string {
  // SecureStore n'accepte que [A-Za-z0-9._-] dans les clés.
  return `zanzigo_${espace}_${proprietaireId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

async function lister(espace: string, proprietaireId: string): Promise<string[]> {
  try {
    const brut = await SecureStore.getItemAsync(cle(espace, proprietaireId));
    const ids = brut ? (JSON.parse(brut) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function ajouter(espace: string, proprietaireId: string, id: string): Promise<void> {
  const ids = await lister(espace, proprietaireId);
  if (!ids.includes(id)) {
    ids.unshift(id); // le plus récent en premier
    await SecureStore.setItemAsync(cle(espace, proprietaireId), JSON.stringify(ids.slice(0, 50)));
  }
}

export const listerColisLocaux = (proprietaireId: string) => lister('colis', proprietaireId);
export const ajouterColisLocal = (proprietaireId: string, colisId: string) =>
  ajouter('colis', proprietaireId, colisId);

export const listerCoursesLocales = (chauffeurId: string) => lister('courses', chauffeurId);
export const ajouterCourseLocale = (chauffeurId: string, courseId: string) =>
  ajouter('courses', chauffeurId, courseId);
