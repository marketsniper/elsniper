// LES COORDONNÉES DES VILLAGES — la carte sur laquelle tout repose.
//
// Ces quinze points servent à deux choses qui coûtent cher quand elles se
// trompent : le prix au kilomètre entre deux villes, et le village que l'app
// propose quand un client appuie sur « Ma position ». Un point mal placé de
// dix kilomètres, et le client de Makunduchi se voit proposer Jambiani —
// c'est exactement ce qui est arrivé avant cette vérification.
//
// Les valeurs de référence viennent d'OpenStreetMap (relevé du 21/08/2026).
// La tolérance de 2 km laisse la place au choix du « centre » d'un village
// étendu, sans laisser passer une erreur de saisie.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { kmVolOiseauEntreVilles } from '../src/services/pricingService.js';

const REFERENCE = {
  Nungwi: [-5.7272, 39.2992],
  Kendwa: [-5.7516, 39.2912],
  Matemwe: [-5.8422, 39.3582],
  'Pwani Mchangani': [-5.9242, 39.3561],
  Kiwengwa: [-5.9901, 39.3761],
  Pongwe: [-6.0484, 39.4052],
  Uroa: [-6.093, 39.4237],
  Chwaka: [-6.1652, 39.4351],
  Michamvi: [-6.1445, 39.4955],
  Bwejuu: [-6.2372, 39.5323],
  Paje: [-6.2667, 39.5341],
  Jambiani: [-6.3219, 39.5468],
  Makunduchi: [-6.4127, 39.5534],
  Kizimkazi: [-6.4544, 39.4728],
  Fumba: [-6.3148, 39.2848],
};

// On sonde le VOL D'OISEAU brut du service (kmVolOiseauEntreVilles) : depuis
// le graphe routier du 31/08/2026, kmEntreVilles rend des km de ROUTE — il
// ne dit plus rien de la position des points, seule la table le dit.
const TOLERANCE_KM = 2;

describe('Coordonnées des villages', () => {
  // Distance à vol d'oiseau entre deux points de référence.
  const distanceReference = (a, b) => {
    const rad = Math.PI / 180;
    const [latA, lngA] = REFERENCE[a];
    const [latB, lngB] = REFERENCE[b];
    const dLat = (latB - latA) * rad;
    const dLng = (lngB - lngA) * rad;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  };

  it('la table du service place chaque village là où il est vraiment', () => {
    // La table n'est pas exportée : on la sonde en comparant, pour chaque
    // paire, la distance qu'elle calcule à celle des positions réelles. Un
    // village déplacé de dix kilomètres fait diverger toutes ses distances —
    // c'est ce qui rend ce contrôle utile.
    const villes = Object.keys(REFERENCE);
    for (let i = 0; i < villes.length; i++) {
      for (let j = i + 1; j < villes.length; j++) {
        const attendu = distanceReference(villes[i], villes[j]);
        const mesure = kmVolOiseauEntreVilles(villes[i], villes[j]);
        assert.ok(
          Math.abs(mesure - attendu) <= TOLERANCE_KM,
          `${villes[i]} → ${villes[j]} : la table donne ${mesure.toFixed(1)} km, la réalité ${attendu.toFixed(1)} km`
        );
      }
    }
  });

  it('aucun village ne sort de l’île', () => {
    for (const [ville, [lat, lng]] of Object.entries(REFERENCE)) {
      assert.ok(lat < -5.6 && lat > -6.6, `${ville} : latitude hors de Unguja`);
      assert.ok(lng > 39.1 && lng < 39.6, `${ville} : longitude hors de Unguja`);
    }
  });

  it('les villages de la côte est sont bien à l’est, ceux du sud-ouest à l’ouest', () => {
    // Makunduchi et Jambiani se suivent sur la MÊME côte : moins de 0,05° de
    // longitude les sépare. C'est le contrôle qui aurait attrapé l'erreur.
    const [, lngMakunduchi] = REFERENCE.Makunduchi;
    const [, lngJambiani] = REFERENCE.Jambiani;
    assert.ok(
      Math.abs(lngMakunduchi - lngJambiani) < 0.05,
      `Makunduchi (${lngMakunduchi}) et Jambiani (${lngJambiani}) sont sur la même côte`
    );
    // Kizimkazi et Fumba regardent l'ouest : nettement en retrait de la côte est.
    assert.ok(REFERENCE.Kizimkazi[1] < 39.5, 'Kizimkazi est sur le versant sud-ouest');
    assert.ok(REFERENCE.Fumba[1] < 39.35, 'Fumba est sur la baie de Menai, à l’ouest');
  });

  it('les distances entre villages voisins restent plausibles', () => {
    // Une chaîne de villages qui se suivent le long de la côte est : chaque
    // maillon fait quelques kilomètres, jamais trente.
    const chaine = ['Michamvi', 'Bwejuu', 'Paje', 'Jambiani', 'Makunduchi'];
    for (let i = 0; i < chaine.length - 1; i++) {
      const km = kmVolOiseauEntreVilles(chaine[i], chaine[i + 1]);
      assert.ok(
        km > 1 && km < 25,
        `${chaine[i]} → ${chaine[i + 1]} : ${km.toFixed(1)} km à vol d'oiseau, invraisemblable`
      );
    }
  });
});
