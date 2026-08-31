/**
 * MOYENS DE PAIEMENT — qui règle quoi, et dans quelle monnaie.
 *
 * Deux moyens, un seul principe : le client choisit, et il voit le montant
 * exact AVANT de payer.
 *
 *  - CARTE BANCAIRE (encaissée en dollars) — ouverte à TOUS depuis le
 *    31/08/2026 (« il faut que les clients puissent payer par carte »,
 *    demande du client). Une facture en shillings est convertie en dollars
 *    au taux de la grille avant d'arriver au circuit carte. Les frais de la
 *    banque sont ajoutés au montant réglé et annoncés : c'est l'usage dans
 *    le tourisme, et sans ça ils mangeaient plus du tiers de la marge de
 *    zanziGo. Pour un montant en shillings, la carte reste un CHOIX — le
 *    portefeuille mobile demeure le moyen par défaut.
 *
 *  - PORTEFEUILLE MOBILE (shillings) — Tigo Pesa, M-Pesa, Airtel Money. AUCUN
 *    frais ajouté. C'est le moyen normal du pays : les locaux n'ont que
 *    celui-là, et un touriste qui a un numéro tanzanien peut le choisir aussi.
 *
 * CE QUI NE CHANGE JAMAIS : le PRIX de la course. Un transfert à 47 USD reste
 * une course à 47 USD dans les comptes, que le client règle 48,88 USD par
 * carte ou 122 200 TZS par portefeuille mobile. La commission du chauffeur se
 * calcule sur le prix, jamais sur le règlement — sinon le chauffeur paierait
 * les frais bancaires du client, ou perdrait au change.
 *
 * LE TAUX. La conversion utilise le taux de la grille (config.usdToTzsRate,
 * 2 600 TZS pour 1 USD) — le même qui sert déjà aux courses privées des
 * locaux et aux colis. Il se règle par la variable USD_TO_TZS_RATE : s'il
 * s'écarte durablement du marché, c'est LÀ qu'il faut le corriger, et les
 * trois circuits suivent ensemble.
 */
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { mentionSurcharge, montantAvecSurcharge } from './surchargeCarte.js';

export const MOYEN_CARTE = 'carte';
export const MOYEN_MOBILE = 'mobile';
export const MOYEN_CREDIT = 'credit'; // crédit prépayé des hôtels (circuit à part)

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Les moyens proposés pour une facture libellée dans cette devise. L'ORDRE
 * fait le défaut : carte d'abord en dollars (comportement historique),
 * portefeuille mobile d'abord en shillings — la carte y est OUVERTE, jamais
 * imposée.
 */
export function moyensPour(devise) {
  return String(devise).toUpperCase() === 'USD'
    ? [MOYEN_CARTE, MOYEN_MOBILE]
    : [MOYEN_MOBILE, MOYEN_CARTE];
}

/** Le moyen retenu quand le client n'a rien choisi (comportement historique). */
export function moyenParDefaut(devise) {
  return moyensPour(devise)[0];
}

/**
 * Prix en dollars → montant à régler en shillings, arrondi aux 100 TZS
 * SUPÉRIEURS : un montant rond se saisit sans erreur sur un portefeuille
 * mobile, et l'arrondi ne joue jamais contre zanziGo (au plus 99 TZS, soit
 * 4 centimes de dollar).
 */
export function enShillings(prixUsd) {
  return Math.ceil((Number(prixUsd) * config.usdToTzsRate) / 100) * 100;
}

/**
 * Ce que le client doit réellement régler.
 *
 * @param prix         prix de la course/du colis/de la place (jamais modifié)
 * @param deviseCourse devise de ce prix ('USD' ou 'TZS')
 * @param moyen        'carte' | 'mobile' | undefined (= moyen par défaut)
 * @returns {{ moyen, devise, montant, surcharge, taux, mention, moyens }}
 *   `devise` et `montant` = ce qui est débité · `surcharge` = la part qui part
 *   chez la banque · `mention` = la phrase à montrer avant de payer.
 * @throws 422 moyen_indisponible — une course en shillings ne se paie pas par
 *   carte : les locaux passent par le portefeuille mobile, point.
 */
export function reglement(prix, deviseCourse, moyen) {
  const devise = String(deviseCourse).toUpperCase();
  const moyens = moyensPour(devise);
  const choisi = moyen ?? moyenParDefaut(devise);
  if (!moyens.includes(choisi)) {
    throw new HttpError(
      422,
      'moyen_indisponible',
      `Moyen de paiement indisponible pour un montant en ${devise} (proposés : ${moyens.join(', ')})`
    );
  }

  // Portefeuille mobile : jamais de frais. Une facture en dollars est
  // convertie au taux de la grille, une facture en shillings ne bouge pas.
  if (choisi === MOYEN_MOBILE) {
    const montant = devise === 'USD' ? enShillings(prix) : round2(prix);
    return {
      moyen: MOYEN_MOBILE,
      devise: 'TZS',
      montant,
      surcharge: 0,
      taux: 0,
      mention:
        devise === 'USD'
          ? `Portefeuille mobile : ${montant} TZS (1 USD = ${config.usdToTzsRate} TZS) — aucun frais`
          : null,
      moyens,
    };
  }

  // CARTE — toujours encaissée EN DOLLARS : le circuit carte (PayPal,
  // Pesapal) ne débite pas les shillings. Une facture en TZS est convertie
  // au même taux de grille que le sens inverse, puis les frais carte
  // s'appliquent sur le montant converti.
  const prixCarte = devise === 'USD' ? round2(Number(prix)) : round2(Number(prix) / config.usdToTzsRate);
  const { montant, surcharge, taux } = montantAvecSurcharge(prixCarte, 'USD');
  return {
    moyen: MOYEN_CARTE,
    devise: 'USD',
    montant,
    surcharge,
    taux,
    mention:
      devise === 'USD'
        ? mentionSurcharge(prix, devise)
        : `Carte bancaire : ${montant} USD (1 USD = ${config.usdToTzsRate} TZS)` +
          (surcharge > 0 ? ` — dont ${surcharge} USD de frais bancaires` : ''),
    moyens,
  };
}

/** Étiquette lisible pour les messages à l'équipe et au client. */
export function libelleMoyen(moyen) {
  if (moyen === MOYEN_MOBILE) return 'Portefeuille mobile (Tigo Pesa / M-Pesa / Airtel Money)';
  if (moyen === MOYEN_CREDIT) return 'Crédit prépayé hôtel';
  return 'Carte bancaire';
}
