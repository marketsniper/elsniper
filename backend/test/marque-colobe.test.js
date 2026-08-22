// LA MARQUE NE DOIT PAS DÉRIVER.
//
// Elle existe en deux exemplaires : `outils/marque/colobe.svg`, le fichier de
// référence sur lequel tourne la recette de validation au rastériseur, et
// `mobile/src/components/marques/Colobe.tsx`, celui que l'application dessine.
// Deux copies d'une même forme finissent toujours par diverger, et la
// divergence serait invisible : les deux continueraient à ressembler à un
// singe qui saute.
//
// Ce test les recoud, et vérifie au passage les interdits qui font la
// différence entre une marque et une mascotte.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SVG = fs.readFileSync(path.resolve(ICI, '../../outils/marque/colobe.svg'), 'utf8');
const TSX = fs.readFileSync(
  path.resolve(ICI, '../../mobile/src/components/marques/Colobe.tsx'),
  'utf8'
);

/** Les tracés d'un fichier, normalisés : les espaces ne comptent pas. */
const traces = (source) =>
  [...source.matchAll(/d="([^"]+)"/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());

/** Les épaisseurs de trait, dans l'ordre. */
const epaisseurs = (source) =>
  [...source.matchAll(/stroke-?[Ww]idth=[{"]([\d.]+)/g)].map((m) => Number(m[1]));

describe('La marque colobe', () => {
  it('est la même dans le fichier de référence et dans l’application', () => {
    const a = traces(SVG);
    const b = traces(TSX);
    assert.ok(a.length >= 5, 'le fichier de référence doit porter au moins cinq tracés');
    assert.deepEqual(b, a, 'les tracés de Colobe.tsx ont divergé de outils/marque/colobe.svg');
    assert.deepEqual(
      epaisseurs(TSX),
      epaisseurs(SVG),
      'les épaisseurs de trait ont divergé — c’est le rapport entre la cuisse et le bras qui fait le colobe'
    );
  });

  it('garde la tête au même endroit et à la même taille', () => {
    // La tête est le seul cercle du dessin. Sa taille est ce qui sépare la
    // marque de la peluche : au-delà, on bascule dans le Kindchenschema.
    const cercle = (s) => {
      const m = s.match(/cx=[{"]?([\d.]+)[}"]?\s+cy=[{"]?([\d.]+)[}"]?\s+r=[{"]?([\d.]+)/);
      return m ? { cx: +m[1], cy: +m[2], r: +m[3] } : null;
    };
    const a = cercle(SVG);
    const b = cercle(TSX);
    assert.ok(a && b, 'la tête doit exister dans les deux fichiers');
    assert.deepEqual(b, a, 'la tête a bougé entre les deux fichiers');
    // Le dessin fait 48 unités de large ; une tête de plus de 12 unités de
    // diamètre ferait basculer le rapport tête/corps au-dessus de 1/4.
    assert.ok(a.r * 2 < 12, `tête trop grosse : ${a.r * 2} unités`);
  });

  it('ne contient ni œil, ni bouche, ni face', () => {
    // Un seul cercle : la tête. Un deuxième serait un œil.
    const cercles = (s) => (s.match(/<[Cc]ircle/g) ?? []).length;
    assert.equal(cercles(SVG), 1, 'le fichier de référence ne doit contenir qu’un cercle : la tête');
    assert.equal(cercles(TSX), 1, 'Colobe.tsx ne doit contenir qu’un cercle : la tête');
  });

  it('reste monochrome — aucune couleur ne porte de sens', () => {
    // Une marque qui a besoin de deux couleurs ne survit pas à une impression
    // en noir, à un autocollant découpé, ni à une icône de 16 pixels.
    for (const [nom, source] of [['colobe.svg', SVG], ['Colobe.tsx', TSX]]) {
      assert.equal(source.includes('Gradient'), false, `${nom} : aucun dégradé`);
      assert.equal(source.includes('opacity'), false, `${nom} : aucune opacité partielle`);
      const couleurs = new Set((source.match(/#[0-9A-Fa-f]{6}/g) ?? []).map((c) => c.toUpperCase()));
      assert.ok(couleurs.size <= 1, `${nom} : ${couleurs.size} couleurs, il en faut au plus une`);
    }
  });

  it('l’application peut la peindre dans la couleur de la peau', () => {
    assert.match(TSX, /couleur \?\? couleurs\.encre/, 'la teinte doit venir du thème');
  });
});
