// Alertes instantanées sur le téléphone de l'équipe.
//
// Le navigateur (Safari sur iPhone, Chrome sur Android) crée un abonnement
// auprès d'Apple ou de Google ; on le confie au serveur, qui pourra ensuite
// faire sonner le téléphone en une à trois secondes — au lieu des trente-cinq
// secondes de la passerelle WhatsApp gratuite.
//
// SUR IPHONE, Apple n'autorise ces alertes QUE si zanziGo a été ajouté à
// l'écran d'accueil (« Partager » puis « Sur l'écran d'accueil »). Dans
// Safari ouvert normalement, la fonction n'existe simplement pas.
import { Platform } from 'react-native';

import { api } from './api';

export type EtatAlertes =
  | 'indisponible' // navigateur sans notifications (ou iPhone hors écran d'accueil)
  | 'refuse' // l'utilisateur a refusé
  | 'inactif' // possible, pas encore activé
  | 'actif';

/** Le navigateur sait-il recevoir des alertes ? */
export function alertesPossibles(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/** iPhone : les alertes exigent l'application ajoutée à l'écran d'accueil. */
export function surIphoneSansInstallation(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installe =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)')?.matches === true;
  return iOS && !installe;
}

export async function etatAlertes(): Promise<EtatAlertes> {
  if (!alertesPossibles()) return 'indisponible';
  if (Notification.permission === 'denied') return 'refuse';
  try {
    const enregistrement = await navigator.serviceWorker.ready;
    const abonnement = await enregistrement.pushManager.getSubscription();
    return abonnement ? 'actif' : 'inactif';
  } catch {
    return 'inactif';
  }
}

/** Convertit la clé publique (texte) au format attendu par le navigateur. */
function cleEnOctets(base64: string): ArrayBuffer {
  const complet = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const brut = atob(complet);
  const tampon = new ArrayBuffer(brut.length);
  const octets = new Uint8Array(tampon);
  for (let i = 0; i < brut.length; i += 1) octets[i] = brut.charCodeAt(i);
  return tampon;
}

/**
 * Active les alertes sur CE téléphone. Renvoie un message d'erreur en
 * français si ça n'a pas pu se faire, ou null en cas de succès.
 */
export async function activerAlertes(nomAppareil: string): Promise<string | null> {
  if (!alertesPossibles()) {
    return surIphoneSansInstallation()
      ? "Sur iPhone, il faut d'abord ajouter zanziGo à l'écran d'accueil : bouton Partager, puis « Sur l'écran d'accueil ». Rouvrez ensuite zanziGo depuis cette icône."
      : "Ce navigateur ne sait pas recevoir d'alertes.";
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return "Les alertes ont été refusées. Autorisez les notifications pour zanziGo dans les réglages du téléphone, puis réessayez.";
  }
  try {
    const { publicKey } = await api.clePush();
    if (!publicKey) return "Le serveur n'est pas encore configuré pour les alertes.";
    const enregistrement = await navigator.serviceWorker.ready;
    const abonnement =
      (await enregistrement.pushManager.getSubscription()) ??
      (await enregistrement.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: cleEnOctets(publicKey),
      }));
    const brut = abonnement.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!brut.endpoint || !brut.keys?.p256dh || !brut.keys?.auth) {
      return "L'abonnement n'a pas pu être créé. Réessayez.";
    }
    await api.abonnerAlertes({
      endpoint: brut.endpoint,
      keys: { p256dh: brut.keys.p256dh, auth: brut.keys.auth },
      label: nomAppareil,
    });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "L'activation a échoué. Réessayez.";
  }
}

/** Coupe les alertes sur ce téléphone. */
export async function desactiverAlertes(): Promise<void> {
  if (!alertesPossibles()) return;
  const enregistrement = await navigator.serviceWorker.ready;
  const abonnement = await enregistrement.pushManager.getSubscription();
  if (!abonnement) return;
  await api.desabonnerAlertes(abonnement.endpoint).catch(() => {});
  await abonnement.unsubscribe().catch(() => {});
}
