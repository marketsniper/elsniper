/**
 * MOYENS DE PAIEMENT — qui règle quoi, et dans quelle monnaie.
 *
 * Deux moyens, un seul principe : le client choisit, et il voit le montant
 * exact AVANT de payer.
 *
 *  - CARTE BANCAIRE (dollars) — réservée aux clients dont le prix est en USD
 *    (touristes, résidents, hôtels). Les frais de la banque sont ajoutés au
 *    prix et annoncés : c'est l'usage dans le tourisme, et sans ça ils
 *    mangeaient plus du tiers de la marge de zanziGo.
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

/** Les moyens proposés pour une facture libellée dans cette devise. */
export function moyensPour(devise) {
  return String(devise).toUpperCase() === 'USD' ? [MOYEN_CARTE, MOYEN_MOBILE] : [MOYEN_MOBILE];
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

  const { montant, surcharge, taux } = montantAvecSurcharge(prix, devise);
  return {
    moyen: MOYEN_CARTE,
    devise,
    montant,
    surcharge,
    taux,
    mention: mentionSurcharge(prix, devise),
    moyens,
  };
}

/** Étiquette lisible pour les messages à l'équipe et au client. */
export function libelleMoyen(moyen) {
  if (moyen === MOYEN_MOBILE) return 'Portefeuille mobile (Tigo Pesa / M-Pesa / Airtel Money)';
  if (moyen === MOYEN_CREDIT) return 'Crédit prépayé hôtel';
  return 'Carte bancaire';
}
