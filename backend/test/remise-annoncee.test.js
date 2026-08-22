// LA REMISE ANNONCÉE AU CLIENT EST CELLE QUE LE MOTEUR APPLIQUE.
//
// Le jour où la remise résident est passée de 10 % à 5 %, le calcul a suivi
// mais les textes de l'application ont continué à promettre 10 % — dans les
// cinq langues, sur six écrans. Un résident lisait « −10 % » et payait 5 %
// de moins : ce n'est pas une coquille, c'est une promesse non tenue.
//
// Ce test relit les traductions et vérifie que chaque pourcentage annoncé à
// côté du mot « remise » (dans chacune des cinq langues) correspond bien au
// taux configuré. Il ne teste pas du code : il teste la cohérence entre ce
// qu'on dit et ce qu'on fait, et c'est précisément là qu'était le trou.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { config } from '../src/config.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const I18N = resolve(ICI, '../../mobile/src/lib/i18n.tsx');

// Les mots qui annoncent une remise, dans les cinq langues de l'application.
const MOTS_REMISE = /remise|discount|punguzo|sconto|rabatt/i;
// « 10 % », « 10% », « 10 Prozent »…
const POURCENTAGE = /(\d+(?:[.,]\d+)?)\s*(?:%|Prozent|asilimia)/gi;

describe('La remise annoncée au client', () => {
  it('affiche le même taux que celui appliqué par le moteur', () => {
    const attendu = Math.round(config.residentDiscountRate * 100);
    assert.equal(attendu, 5, 'le taux configuré a changé — mettre les textes à jour AVANT');

    const lignes = readFileSync(I18N, 'utf8').split('\n');
    const fautives = [];

    lignes.forEach((ligne, i) => {
      if (!MOTS_REMISE.test(ligne)) return;
      // Les remises exprimées en argent (parrainage : « 5 $ ») ne sont pas
      // concernées, ni les compteurs de fidélité (« 20 courses »).
      for (const [, valeur] of ligne.matchAll(POURCENTAGE)) {
        const taux = Number(valeur.replace(',', '.'));
        // Les frais bancaires (4 %) sont un supplément, pas une remise ;
        // ils ne sont jamais annoncés dans une phrase de remise.
        if (taux !== attendu) {
          fautives.push(`  i18n.tsx:${i + 1} — annonce ${taux} % : ${ligne.trim().slice(0, 110)}`);
        }
      }
    });

    assert.equal(
      fautives.length,
      0,
      `Des textes annoncent une remise différente des ${attendu} % appliqués :\n${fautives.join('\n')}`
    );
  });
});
