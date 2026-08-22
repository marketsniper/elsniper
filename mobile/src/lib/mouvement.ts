// LE MOUVEMENT, ET LE DROIT DE LE COUPER.
//
// L'application respire : les palmes ondulent, un colobe traverse la
// canopée, un taxi roule. Ce mouvement ne s'arrête jamais — sauf pour les
// personnes qui ont demandé à leur téléphone de réduire les animations.
// Ce réglage existe parce que le mouvement rend certaines personnes
// malades ; on ne le contourne pas.
import React from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/** Le mouvement est-il autorisé sur cet appareil ? */
export function useMouvementAutorise(): boolean {
  const [autorise, setAutorise] = React.useState(true);
  React.useEffect(() => {
    let vivant = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduit) => vivant && setAutorise(!reduit))
      .catch(() => {});
    const abo = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduit) =>
      setAutorise(!reduit)
    );
    return () => {
      vivant = false;
      abo.remove();
    };
  }, []);
  return autorise;
}

/**
 * Une boucle sans fin, de 0 à 1, EN PILOTE NATIF.
 *
 * Le pilote natif est ce qui rend l'animation gratuite : la valeur part sur
 * le fil d'animation du téléphone et ne réveille pas le JavaScript à chaque
 * image. Le défilement de la page reste fluide pendant que tout bouge, même
 * sur un téléphone d'entrée de gamme.
 *
 * `retard` décale le départ : sans lui, dix palmes ondulent à l'unisson et
 * l'écran bat la mesure comme un métronome.
 */
export function useBoucle(secondes: number, active: boolean, retard = 0): Animated.Value {
  const valeur = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!active) return;
    const boucle = Animated.loop(
      Animated.timing(valeur, {
        toValue: 1,
        duration: secondes * 1000,
        delay: retard * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    boucle.start();
    return () => boucle.stop();
  }, [valeur, secondes, active, retard]);
  return valeur;
}
