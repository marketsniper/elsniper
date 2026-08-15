// Obtenir la position du téléphone, sur le web comme dans l'app installée.
//
// Deux mondes, une seule fonction : le navigateur passe par
// `navigator.geolocation`, l'application installée par expo-location. Dans les
// deux cas, un refus ou un GPS coupé renvoie un message en français plutôt
// qu'une exception technique — c'est un client ou un chauffeur qui lit.
import { Platform } from 'react-native';

export interface Position {
  lat: number;
  lng: number;
}

export interface ResultatPosition {
  position: Position | null;
  /** Message prêt à afficher si la position n'a pas pu être obtenue. */
  souci: string | null;
}

const REFUS =
  "Localisation refusée. Autorisez l'accès à votre position dans les réglages du téléphone, puis réessayez.";
const INDISPONIBLE =
  "Impossible d'obtenir votre position. Vérifiez que le GPS est allumé, puis réessayez.";

async function positionWeb(): Promise<ResultatPosition> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { position: null, souci: INDISPONIBLE };
  }
  return new Promise((resoudre) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resoudre({
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          souci: null,
        }),
      (erreur) =>
        resoudre({
          position: null,
          // 1 = permission refusée ; 2 = position indisponible ; 3 = délai dépassé.
          souci: erreur?.code === 1 ? REFUS : INDISPONIBLE,
        }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }
    );
  });
}

async function positionNative(): Promise<ResultatPosition> {
  try {
    const Location = await import('expo-location');
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return { position: null, souci: REFUS };
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return {
      position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      souci: null,
    };
  } catch {
    return { position: null, souci: INDISPONIBLE };
  }
}

export function positionActuelle(): Promise<ResultatPosition> {
  return Platform.OS === 'web' ? positionWeb() : positionNative();
}

/** Lien de NAVIGATION : ouvre le guidage routier jusqu'à ce point. */
export function lienNavigation(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}
