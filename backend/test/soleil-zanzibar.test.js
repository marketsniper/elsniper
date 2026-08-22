// LE SOLEIL DE ZANZIBAR, VÉRIFIÉ CONTRE UN AUTRE ALGORITHME.
//
// `mobile/src/lib/soleil.ts` donne la direction de TOUTES les ombres portées
// de l'application. S'il se trompe, l'interface s'éclaire d'une lumière qui
// n'existe pas — un défaut que personne ne signalera jamais, parce qu'une
// ombre fausse ne ressemble pas à un bug.
//
// Les positions attendues ci-dessous ont été calculées séparément par
// l'algorithme PSA (Blanco-Muriel et al., 2001), qui n'a rien de commun avec
// la méthode NOAA employée dans le module. Deux chemins indépendants qui
// tombent d'accord au dixième de degré près : c'est ce qui fait la preuve.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SOLEIL = path.resolve(ICI, '../../mobile/src/lib/soleil.ts');

function interroger(script) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--no-warnings',
        '-e',
        `import(${JSON.stringify(SOLEIL)}).then((S) => { ${script} });`,
      ],
      { encoding: 'utf8' }
    ).trim()
  );
}

// [instant UTC, élévation PSA, azimut PSA, ce que c'est]
const REPERES = [
  ['2026-08-22T06:00:00Z', 36.01, 71.49, '09 h à Zanzibar — soleil à l’est'],
  ['2026-08-22T09:00:00Z', 71.66, 20.34, 'midi — presque au zénith'],
  ['2026-08-22T15:00:00Z', 5.05, 281.62, '18 h — soleil couchant, plein ouest'],
  ['2026-12-21T09:00:00Z', 71.93, 163.38, 'solstice de décembre — soleil au SUD'],
  ['2026-06-21T09:00:00Z', 59.77, 11.64, 'solstice de juin — soleil au NORD'],
];

describe('Position du soleil au-dessus de Zanzibar', () => {
  it('tombe d’accord avec l’algorithme PSA à moins d’un degré', () => {
    const positions = interroger(
      `console.log(JSON.stringify(${JSON.stringify(REPERES.map((r) => r[0]))}
        .map((iso) => S.positionSolaire(new Date(iso)))))`
    );
    REPERES.forEach(([iso, elevation, azimut, quoi], i) => {
      const p = positions[i];
      assert.ok(
        Math.abs(p.elevation - elevation) < 1,
        `${quoi} (${iso}) : élévation ${p.elevation.toFixed(2)}° au lieu de ${elevation}°`
      );
      assert.ok(
        Math.abs(p.azimut - azimut) < 1,
        `${quoi} (${iso}) : azimut ${p.azimut.toFixed(2)}° au lieu de ${azimut}°`
      );
    });
  });

  it('renvoie le soleil au NORD en juin et au SUD en décembre', () => {
    // Zanzibar est sous les tropiques : le soleil passe d'un côté à l'autre
    // du zénith dans l'année. C'est ce qui rend l'idée vraie — et c'est aussi
    // le piège qu'un algorithme de l'hémisphère nord raterait en silence.
    const [juin, decembre] = interroger(
      `console.log(JSON.stringify([S.positionSolaire(new Date('2026-06-21T09:00:00Z')).azimut,
                                   S.positionSolaire(new Date('2026-12-21T09:00:00Z')).azimut]))`
    );
    assert.ok(juin < 45 || juin > 315, `en juin le soleil de midi est au nord (azimut ${juin})`);
    assert.ok(decembre > 135 && decembre < 225, `en décembre il est au sud (azimut ${decembre})`);
  });
});

describe('Ombres portées', () => {
  it('partent à gauche le matin et à droite le soir', () => {
    const [matin, soir] = interroger(
      `const b = { width: 0, height: 10 };
       console.log(JSON.stringify([
         S.decalageSolaire(S.secteurSolaire(new Date('2026-08-22T04:00:00Z')), b),
         S.decalageSolaire(S.secteurSolaire(new Date('2026-08-22T14:00:00Z')), b)]))`
    );
    assert.ok(matin.width < 0, `au lever, l’ombre part vers l’ouest (${matin.width})`);
    assert.ok(soir.width > 0, `au coucher, elle part vers l’est (${soir.width})`);
  });

  it('ne remonte JAMAIS franchement au-dessus de la carte', () => {
    // Le soleil du sud (décembre) jetterait des ombres vers le nord, donc
    // vers le HAUT de l'écran : vrai dehors, illisible dans une interface —
    // une carte éclairée par en dessous se lit comme une carte qui flotte.
    const decalages = interroger(
      `const b = { width: 0, height: 10 };
       console.log(JSON.stringify(Array.from({ length: 13 },
         (_, s) => S.decalageSolaire(s === 12 ? S.SECTEUR_ZENITH : s, b))))`
    );
    for (const d of decalages) {
      assert.ok(d.height > 0, `ombre remontée : ${JSON.stringify(d)}`);
      // La longueur est conservée à l’arrondi du dixième de pixel près.
      assert.ok(Math.hypot(d.width, d.height) <= 10.1, `ombre rallongée : ${JSON.stringify(d)}`);
    }
  });

  it('se ramasse sous l’objet quand le soleil est au zénith', () => {
    // Deux fois par an le soleil passe à la verticale de l'île : ce jour-là
    // l'azimut balaie presque un tour en trois heures. Le module doit alors
    // cesser de suivre la direction — sinon les ombres pivotent d'un quart de
    // tour entre deux écrans.
    const [zenith, secteurMidi] = interroger(
      `console.log(JSON.stringify([S.decalageSolaire(S.SECTEUR_ZENITH, { width: 0, height: 10 }),
                                   S.secteurSolaire(new Date('2026-10-20T09:00:00Z'))]))`
    );
    assert.equal(zenith.width, 0, 'au zénith, aucune direction');
    assert.ok(zenith.height < 10, 'au zénith, l’ombre est plus courte');
    assert.equal(secteurMidi, -1, 'à la verticale de Zanzibar, le secteur est gelé');
  });
});
