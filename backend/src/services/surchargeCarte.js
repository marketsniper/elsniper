/**
 * SURCHARGE CARTE BANCAIRE — les frais de la banque à la charge du payeur.
 *
 * Pourquoi. La commission bancaire se prend sur la COURSE ENTIÈRE, pas sur
 * la part de zanziGo. Sur un transfert à 47 USD dont nous gardons 4,70, une
 * commission de 3,5 % représente 1,65 — plus du tiers de notre marge. À
 * l'échelle d'un mois, c'est le premier poste de dépense de la plateforme,
 * loin devant le serveur.
 *
 * La règle retenue : le client qui choisit la carte paie les frais de la
 * carte. C'est l'usage partout dans le tourisme, ça s'annonce sans gêne, et
 * ça ne coûte rien à celui qui paie autrement.
 *
 * LE PIÈGE DU TAUX. Une surcharge de 3 % NE COUVRE PAS 3,5 % de frais : la
 * banque prélève son pourcentage sur le montant DÉJÀ surchargé.
 *
 *     47 USD → le client paie 48,41 → la banque prend 3,5 % de 48,41 = 1,69
 *     surcharge encaissée 1,41 · frais réels 1,69 · il manque 0,28
 *
 * Le taux d'équilibre est frais / (1 − frais), soit 3,63 % pour 3,5 %. On
 * applique 4 % : chiffre rond, annonçable, et la petite marge absorbe les
 * variations de taux de change et les cartes étrangères plus chères.
 *
 * QUI N'EST JAMAIS SURCHARGÉ :
 *  - les paiements en TZS (locaux, portefeuille mobile Tigo / M-Pesa) —
 *    leur moyen de paiement normal, et 2 % sur une course à 16 000 TZS ne
 *    justifie pas d'abîmer la relation ;
 *  - les hôtels qui règlent sur leur crédit prépayé — ils ont déjà payé les
 *    frais une seule fois en rechargeant leur compte.
 */
import { config } from '../config.js';

const round2 = (n) => Math.round(n * 100) / 100;

/** La carte ENCAISSE toujours en dollars : une facture en shillings est
 *  convertie en USD par `reglement` AVANT d'arriver ici (31/08/2026 — la
 *  carte est ouverte à tous, le portefeuille mobile reste le défaut des
 *  montants en TZS). La devise reçue ici dit donc qui est surchargé. */
export function surchargeApplicable(devise) {
  return String(devise).toUpperCase() === 'USD' && config.surchargeCarte > 0;
}

/**
 * Ce que le client devra régler, et ce que la surcharge représente.
 *
 * @returns {{ montant: number, surcharge: number, taux: number }}
 *   `montant` = ce qui est débité · `surcharge` = la part ajoutée pour les
 *   frais · `taux` = 0 quand rien n'est ajouté (le prix reste le prix).
 */
export function montantAvecSurcharge(prix, devise) {
  const base = Number(prix);
  if (!Number.isFinite(base) || !surchargeApplicable(devise)) {
    return { montant: round2(base), surcharge: 0, taux: 0 };
  }
  const surcharge = round2(base * config.surchargeCarte);
  return { montant: round2(base + surcharge), surcharge, taux: config.surchargeCarte };
}

/** Phrase prête à afficher, pour que le client sache AVANT de payer. */
export function mentionSurcharge(prix, devise) {
  const { surcharge, taux } = montantAvecSurcharge(prix, devise);
  if (surcharge <= 0) return null;
  return `Frais bancaires carte ${(taux * 100).toFixed(0)} % : +${surcharge} ${devise}`;
}
