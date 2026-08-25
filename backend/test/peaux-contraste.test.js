// ══════════════════════════════════════════════════════════════════════════
// LES PEAUX : AUCUN TEXTE ILLISIBLE, AUCUNE PEAU OUBLIÉE.
//
// Une peau, c'est une trentaine de couleurs qui doivent tenir DEUX À DEUX :
// il ne sert à rien qu'un vert soit joli si l'encre posée dessus disparaît.
// Le contrôle se faisait à l'œil, et l'œil laisse passer : « Activer
// maintenant » s'écrivait en OR sur l'accent de la peau — c'est-à-dire, en
// Nuit d'épices, en or sur de l'or. 1,00:1. La seule action du bandeau des
// chauffeurs était invisible, et personne ne l'avait vu.
//
// Ce fichier lit `mobile/src/lib/theme.ts` — la source, pas une copie — et
// mesure chaque couple de rôles pour CHAQUE peau. Une sixième peau ajoutée
// demain est vérifiée sans qu'on ait une ligne à écrire ici.
//
// Deux seuils, ceux de la WCAG :
//  · 4,5:1 pour le texte courant ;
//  · 3:1 pour ce qui n'existe qu'en gras et en grand — l'étiquette d'une
//    pastille, le libellé d'un bouton plein.
//
// Les couleurs en rgba() sont IGNORÉES : leur contraste dépend de ce qui
// passe dessous, il n'est pas mesurable ici. Idem pour le Lagon, dont le fond
// réel est un dégradé — la mesure qui fait foi pour lui est au pixel, dans
// outils/logotype/LISEZMOI.md.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const theme = readFileSync(path.join(racine, 'mobile', 'src', 'lib', 'theme.ts'), 'utf8');
const preference = readFileSync(
  path.join(racine, 'mobile', 'src', 'lib', 'preferencePeau.tsx'),
  'utf8'
);

// ───────────────────────────── LA MESURE ───────────────────────────────────
function canalLineaire(valeur) {
  const c = valeur / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminance relative WCAG, ou null si la couleur n'est pas un #rrggbb opaque. */
function luminance(couleur) {
  const m = /^#([0-9a-f]{6})$/i.exec((couleur ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return (
    0.2126 * canalLineaire(n >> 16) +
    0.7152 * canalLineaire((n >> 8) & 255) +
    0.0722 * canalLineaire(n & 255)
  );
}

function contraste(texte, fond) {
  const a = luminance(texte);
  const b = luminance(fond);
  if (a === null || b === null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// ──────────────────────── LES PALETTES, LUES À LA SOURCE ───────────────────
function lirePalettes() {
  const palettes = {};
  for (const bloc of theme.matchAll(/^const ([A-Z]+): Palette = \{([\s\S]*?)^\};/gm)) {
    const couleurs = {};
    for (const ligne of bloc[2].matchAll(/^\s*(\w+):\s*'([^']+)'/gm)) {
      couleurs[ligne[1]] = ligne[2];
    }
    palettes[bloc[1]] = couleurs;
  }
  return palettes;
}

const PALETTES = lirePalettes();

/** Les noms de peaux déclarés par le type — la liste qui fait foi. */
const NOMS_DE_PEAU = /export type NomPeau =([^;]+);/
  .exec(theme)[1]
  .split('|')
  .map((s) => s.trim().replace(/'/g, ''));

// Texte courant : 4,5:1.
const COURANT = [
  ['encre', 'sable', 'le texte sur le fond de l’écran'],
  ['encre', 'blanc', 'le texte sur une carte'],
  ['encre', 'surface', 'le texte dans un champ de saisie'],
  ['texteSecondaire', 'blanc', 'le texte secondaire sur une carte'],
  ['texteSecondaire', 'sable', 'le texte secondaire sur le fond'],
  ['surAccent', 'accentFond', 'le texte du bloc de mise en avant'],
  ['marqueNom', 'sable', 'le « zanzi » du logotype'],
  ['marqueGo', 'sable', 'le « Go » du logotype'],
  ['succes', 'blanc', 'un libellé de succès sur une carte'],
  ['danger', 'blanc', 'un libellé d’erreur sur une carte'],
  ['attente', 'blanc', 'un libellé d’attente sur une carte'],
  ['primaireFonce', 'blanc', 'un lien sur une carte'],
];

// Gras et grand seulement — étiquettes de pastille, libellés de bouton : 3:1.
const GRAS = [
  ['surPrimaire', 'primaire', 'le libellé d’un bouton plein'],
  ['surSucces', 'succes', 'l’étiquette d’une pastille de succès'],
  ['surVertFeu', 'vertFeu', 'l’étiquette « payée »'],
  ['surChauffeur', 'chauffeurFond', 'le titre de la carte chauffeur'],
];

describe('Les peaux : contrastes mesurés, couple par couple', () => {
  it('chaque peau déclare une palette complète', () => {
    // Une peau ajoutée au type mais oubliée dans les palettes s'ouvrirait sur
    // des couleurs `undefined` — un écran blanc, sans erreur.
    assert.equal(
      Object.keys(PALETTES).length,
      NOMS_DE_PEAU.length,
      `${NOMS_DE_PEAU.length} peaux déclarées (${NOMS_DE_PEAU.join(', ')}), ` +
        `${Object.keys(PALETTES).length} palettes trouvées`
    );
    for (const [nom, palette] of Object.entries(PALETTES)) {
      for (const [texte, fond] of [...COURANT, ...GRAS]) {
        assert.ok(palette[texte], `${nom} : couleur « ${texte} » absente`);
        assert.ok(palette[fond], `${nom} : couleur « ${fond} » absente`);
      }
    }
  });

  it('le texte courant tient 4,5:1 sur son fond, dans toutes les peaux', () => {
    for (const [nom, palette] of Object.entries(PALETTES)) {
      for (const [texte, fond, role] of COURANT) {
        const mesure = contraste(palette[texte], palette[fond]);
        if (mesure === null) continue; // rgba() : dépend de ce qui passe dessous
        assert.ok(
          mesure >= 4.5,
          `${nom} : ${role} — ${palette[texte]} sur ${palette[fond]} ` +
            `ne fait que ${mesure.toFixed(2)}:1 (4,5 exigés)`
        );
      }
    }
  });

  it('les libellés en gras tiennent 3:1 sur leur aplat', () => {
    for (const [nom, palette] of Object.entries(PALETTES)) {
      for (const [texte, fond, role] of GRAS) {
        const mesure = contraste(palette[texte], palette[fond]);
        if (mesure === null) continue;
        assert.ok(
          mesure >= 3,
          `${nom} : ${role} — ${palette[texte]} sur ${palette[fond]} ` +
            `ne fait que ${mesure.toFixed(2)}:1 (3,0 exigés)`
        );
      }
    }
  });

  it('« en course » et « payée » ne peuvent pas être de la même couleur', () => {
    // La pastille « en course » est peinte en `primaire`, la pastille
    // « payée » en `vertFeu`. Ce sont les deux états que le chauffeur lit
    // sans s'arrêter : si les deux aplats se confondent, il ne lui reste que
    // le mot à déchiffrer, moteur tournant. C'est ce qui a fait peindre le
    // feu vert de Girofle en BLANC — le vert y étant déjà la couleur des
    // actions.
    for (const [nom, palette] of Object.entries(PALETTES)) {
      const ecart = contraste(palette.primaire, palette.vertFeu);
      if (ecart === null) continue;
      assert.ok(
        ecart >= 1.5,
        `${nom} : « en course » (${palette.primaire}) et « payée » ` +
          `(${palette.vertFeu}) ne se distinguent qu'à ${ecart.toFixed(2)}:1`
      );
    }
  });

  it('aucune peau ne manque au sélecteur : le client peut toutes les choisir', () => {
    // Le défaut historique : une peau livrée mais absente de la liste. Elle
    // existe dans le code, personne ne la voit — et on cherche le bug dans le
    // cache du téléphone.
    const proposees = /PEAUX_AU_CHOIX = \[([\s\S]*?)\]/
      .exec(preference)[1]
      .match(/'(\w+)'/g)
      .map((s) => s.replace(/'/g, ''));
    assert.deepEqual(
      [...proposees].sort(),
      [...NOMS_DE_PEAU].sort(),
      'le sélecteur d’apparence ne propose pas exactement les peaux déclarées'
    );
  });
});
