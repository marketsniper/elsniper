// Carte « alertes instantanées » — la même mécanique pour l'équipe et pour un
// chauffeur, avec une différence essentielle : ce que le téléphone recevra.
//
// L'équipe est alertée de toute la plateforme (réservations, paiements,
// inscriptions). Un chauffeur ne reçoit QUE ses propres courses : celle qu'on
// lui attribue, son paiement, son annulation. Le cloisonnement est appliqué
// par le serveur ; ici, `cible` dit simplement à quel titre ce téléphone
// s'abonne.
import React, { useEffect, useState } from 'react';

import { Bouton, Carte, EncartInfo, SousTitre } from '@/components/ui';
import {
  activerAlertes,
  desactiverAlertes,
  etatAlertes,
  surIphoneSansInstallation,
  type CibleAlertes,
  type EtatAlertes,
} from '@/lib/alertesPush';
import { api, ErreurApi } from '@/lib/api';
import { useT } from '@/lib/i18n';

export function CarteAlertes({
  cible,
  titre,
  intro,
  nomAppareil,
}: {
  cible: CibleAlertes;
  titre: string;
  intro: string;
  nomAppareil: string;
}) {
  const { t } = useT();
  const [etat, setEtat] = useState<EtatAlertes>('inactif');
  const [message, setMessage] = useState('');
  const [enCours, setEnCours] = useState<'activer' | 'couper' | 'test' | null>(null);

  useEffect(() => {
    etatAlertes().then(setEtat).catch(() => {});
  }, []);

  // try/finally sur les DEUX : Notification.requestPermission peut lever
  // (Safari ancien, contexte non sécurisé) et serviceWorker.ready ne résout
  // jamais sans service worker — sans le finally, le bouton restait en
  // chargement pour toujours, et « couper » acceptait les appuis en rafale.
  const allumer = async () => {
    setMessage('');
    setEnCours('activer');
    try {
      const souci = await activerAlertes(nomAppareil, cible);
      setMessage(souci ?? t('alertes_ok'));
      setEtat(await etatAlertes());
    } catch {
      setMessage(t('alertes_indisponible'));
    } finally {
      setEnCours(null);
    }
  };

  const couper = async () => {
    setMessage('');
    setEnCours('couper');
    try {
      await desactiverAlertes(cible);
      setMessage(t('alertes_coupees'));
      setEtat(await etatAlertes());
    } catch {
      setMessage(t('alertes_indisponible'));
    } finally {
      setEnCours(null);
    }
  };

  const essayer = async () => {
    setMessage('');
    setEnCours('test');
    try {
      const resultat =
        cible === 'chauffeur' ? await api.testerAlertesChauffeur() : await api.testerAlertes();
      setMessage(
        resultat.envoyes > 0
          ? t('alertes_test_envoye', { n: String(resultat.envoyes) })
          : t('alertes_test_vide')
      );
    } catch (e) {
      setMessage(e instanceof ErreurApi ? e.message : t('alertes_test_vide'));
    } finally {
      setEnCours(null);
    }
  };

  return (
    <Carte>
      <SousTitre>{titre}</SousTitre>
      {etat === 'actif' ? (
        <>
          <EncartInfo icone="notifications" ton="succes">
            {t('alertes_actives')}
          </EncartInfo>
          <Bouton
            titre={t('alertes_tester')}
            icone="volume-high-outline"
            variante="secondaire"
            onPress={essayer}
            charge={enCours === 'test'}
          />
          <Bouton
            titre={t('alertes_couper')}
            icone="notifications-off-outline"
            variante="secondaire"
            onPress={couper}
            charge={enCours === 'couper'}
          />
        </>
      ) : etat === 'indisponible' ? (
        // iPhone hors écran d'accueil : la marche à suivre, en toutes lettres.
        <EncartInfo icone="information-circle-outline" ton="attente">
          {surIphoneSansInstallation() ? t('alertes_iphone') : t('alertes_indisponible')}
        </EncartInfo>
      ) : (
        <>
          <EncartInfo icone="notifications-outline">{intro}</EncartInfo>
          <Bouton
            titre={t('alertes_activer')}
            icone="notifications-outline"
            onPress={allumer}
            charge={enCours === 'activer'}
          />
        </>
      )}
      {!!message && <SousTitre>{message}</SousTitre>}
    </Carte>
  );
}
