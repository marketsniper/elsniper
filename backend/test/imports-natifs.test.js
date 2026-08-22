// UNE MISE À JOUR À DISTANCE NE POUSSE QUE DU JAVASCRIPT.
//
// Le code natif d'une application ne bouge qu'en la réinstallant. Si le
// JavaScript publié se met à utiliser un module natif que le téléphone n'a
// pas, le téléphone ne le dit pas : il monte une vue que le système ne
// connaît pas, ou il lève une erreur au premier appel. Dans les deux cas
// personne ne voit rien venir — pas de message, pas d'alerte, juste des
// écrans abîmés chez des chauffeurs qui ne rappelleront pas.
//
// C'EST EXACTEMENT CE QUI EST ARRIVÉ. Le 21/08/2026, `expo-blur` est entré
// dans le projet. L'application installée par les chauffeurs datait du
// 16/08 et ne le contenait pas. Le garde écrit à l'époque — un try/catch
// autour du require — ne gardait rien : `expo-blur` passe par
// `requireNativeViewManager`, qui NE LÈVE JAMAIS en production. Toutes les
// mises à jour publiées entre les deux ont donc envoyé, dans chaque carte de
// chaque écran, une vue native absente du binaire.
//
// Ce test est la clôture de cette histoire. Il lit le contrat du binaire
// (mobile/binaire.json), analyse l'arbre syntaxique de tout mobile/src, et
// refuse :
//   · tout import statique d'un module natif hors contrat ;
//   · tout chargement différé d'un module natif hors contrat qui ne serait
//     pas protégé par une VRAIE sonde (`requireOptionalNativeModule`, la
//     seule qui renvoie null au lieu de lever) ;
//   · toute dérive entre le lien de téléchargement servi aux chauffeurs et
//     le binaire décrit par le contrat.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(ICI, '../../mobile');
const SRC = path.join(MOBILE, 'src');
const CONTRAT = JSON.parse(fs.readFileSync(path.join(MOBILE, 'binaire.json'), 'utf8'));

// TypeScript vit dans mobile/ : on le charge de là plutôt que d'écrire une
// expression régulière. Un `import` peut s'étaler sur cinq lignes, être
// précédé d'un commentaire qui en contient un faux, ou porter `type` — seul
// un vrai analyseur syntaxique ne s'y trompe pas.
const requireMobile = createRequire(path.join(MOBILE, 'package.json'));
const ts = requireMobile('typescript');

/** Un paquet porte-t-il du code natif ? Constaté dans node_modules. */
function estNatif(paquet) {
  const d = path.join(MOBILE, 'node_modules', ...paquet.split('/'));
  if (!fs.existsSync(d)) return false;
  if (fs.existsSync(path.join(d, 'expo-module.config.json'))) return true;
  if (fs.existsSync(path.join(d, 'android')) || fs.existsSync(path.join(d, 'ios'))) return true;
  return fs.readdirSync(d).some((f) => f.endsWith('.podspec'));
}

/** Le nom de paquet d'un spécificateur : « expo-router/build/x » → « expo-router ». */
function paquetDe(specificateur) {
  if (specificateur.startsWith('.') || specificateur.startsWith('@/')) return null;
  const bouts = specificateur.split('/');
  return specificateur.startsWith('@') ? bouts.slice(0, 2).join('/') : bouts[0];
}

function fichiersSource(racine) {
  const sortie = [];
  for (const entree of fs.readdirSync(racine, { withFileTypes: true })) {
    const p = path.join(racine, entree.name);
    if (entree.isDirectory()) sortie.push(...fichiersSource(p));
    else if (/\.tsx?$/.test(entree.name)) sortie.push(p);
  }
  return sortie;
}

/** Les modules chargés par un fichier, et comment. */
function analyser(fichier) {
  const source = fs.readFileSync(fichier, 'utf8');
  const arbre = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const statiques = [];
  const differes = [];
  let sonde = false;

  const visiter = (n) => {
    // import … from 'x'  /  export … from 'x'
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier
      && ts.isStringLiteral(n.moduleSpecifier)) {
      // « import type » disparaît à la compilation : aucun code n'est chargé.
      const typeSeul = ts.isImportDeclaration(n)
        && (n.importClause?.isTypeOnly
          || (n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings)
            && n.importClause.namedBindings.elements.every((e) => e.isTypeOnly)));
      if (!typeSeul) statiques.push(n.moduleSpecifier.text);
    }
    if (ts.isCallExpression(n)) {
      const cible = n.expression;
      const litteral = n.arguments[0] && ts.isStringLiteral(n.arguments[0]) ? n.arguments[0].text : null;
      // require('x')  et  import('x')
      if ((ts.isIdentifier(cible) && cible.text === 'require') || cible.kind === ts.SyntaxKind.ImportKeyword) {
        if (litteral) differes.push(litteral);
        // Un spécificateur calculé est invisible à toute analyse : on l'interdit.
        else if (n.arguments.length) differes.push('<calculé>');
      }
      if (ts.isIdentifier(cible) && cible.text === 'requireOptionalNativeModule') sonde = true;
    }
    ts.forEachChild(n, visiter);
  };
  ts.forEachChild(arbre, visiter);
  return { statiques, differes, sonde };
}

let fichiers = [];
before(() => {
  fichiers = fichiersSource(SRC);
});

describe('Modules natifs et mises à jour à distance', () => {
  it('le contrat du binaire est cohérent', () => {
    assert.ok(CONTRAT.modulesNatifs.length > 0, 'le contrat doit lister des modules');
    for (const m of CONTRAT.modulesNatifs) {
      assert.ok(estNatif(m), `${m} est au contrat mais n'a pas de code natif dans node_modules`);
    }
    assert.match(CONTRAT.runtimeVersion, /^exposdk:\d+\.\d+\.\d+$|^[\w.+()-]+$/);
  });

  it('aucun module natif hors contrat n’est importé en tête de fichier', () => {
    const fautes = [];
    for (const f of fichiers) {
      for (const spec of analyser(f).statiques) {
        const paquet = paquetDe(spec);
        if (!paquet || !estNatif(paquet)) continue;
        if (!CONTRAT.modulesNatifs.includes(paquet)) {
          fautes.push(`${path.relative(MOBILE, f)} importe « ${paquet} », absent du binaire installé`);
        }
      }
    }
    assert.deepEqual(
      fautes,
      [],
      `Un import statique s'exécute dès le chargement du module : le téléphone ne peut ` +
        `pas s'en protéger.\n${fautes.join('\n')}\n\n` +
        `→ soit ce module attend la prochaine application (et il ne doit pas être importé),\n` +
        `→ soit une nouvelle application vient d'être diffusée : mettez à jour mobile/binaire.json.`
    );
  });

  it('un module natif hors contrat chargé à la demande porte une VRAIE sonde', () => {
    // La leçon d'expo-blur : un try/catch ne protège que des modules qui
    // LÈVENT. `requireNativeViewManager` ne lève pas. Seule
    // `requireOptionalNativeModule`, qui renvoie null, protège à coup sûr.
    const fautes = [];
    for (const f of fichiers) {
      const { differes, sonde } = analyser(f);
      for (const spec of differes) {
        if (spec === '<calculé>') {
          fautes.push(`${path.relative(MOBILE, f)} charge un module dont le nom est calculé — illisible pour ce test`);
          continue;
        }
        const paquet = paquetDe(spec);
        if (!paquet || !estNatif(paquet)) continue;
        if (CONTRAT.modulesNatifs.includes(paquet)) continue;
        if (!sonde) {
          fautes.push(
            `${path.relative(MOBILE, f)} charge « ${paquet} » (absent du binaire) sans requireOptionalNativeModule`
          );
        }
      }
    }
    assert.deepEqual(fautes, [], fautes.join('\n'));
  });

  it('le lien de téléchargement servi aux chauffeurs est celui du binaire au contrat', () => {
    // Une URL d'artefact écrite en dur dans une page HTML est une dépendance
    // que rien ne versionne : elle a survécu à 93 commits, dont celui qui a
    // ajouté un module natif.
    const pages = fs.readFileSync(path.join(ICI, '../src/app.js'), 'utf8');
    const liens = [...pages.matchAll(/https:\/\/expo\.dev\/artifacts\/eas\/[\w-]+\.apk/g)].map((m) => m[0]);
    assert.ok(liens.length > 0, 'aucun lien APK trouvé dans les pages');
    for (const lien of new Set(liens)) {
      assert.equal(
        lien,
        CONTRAT.artefact,
        'la page propose une application différente de celle décrite par mobile/binaire.json'
      );
    }
  });
});
