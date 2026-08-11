// Onglet « Colis » : liste des colis envoyés + création.
// Hôtel : liste via GET /hotels/:id/packages. Utilisateur : l'API n'expose
// pas de liste par expéditeur → ids mémorisés localement (lib/colisLocal)
// puis rechargés via GET /packages/:id.
// « Faire le ménage » : masque les colis livrés/annulés antérieurs au coup
// de balai (local à l'appareil — rien n'est supprimé chez zanziGo).
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { FondPlage } from '@/components/FondPlage';
import { BadgeStatutColis, Bouton, EtatVide } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { listerColisLocaux } from '@/lib/colisLocal';
import { libelleTailleColis, useT } from '@/lib/i18n';
import { estBalaye, lireCoupDeBalai, passerCoupDeBalai } from '@/lib/menageLocal';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  formaterPrix,
  type Colis,
  type StatutColis,
  type TailleColis,
} from '@/lib/types';

const STATUTS_FINIS: StatutColis[] = ['delivered', 'cancelled'];

export default function EcranColis() {
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useT();
  const [colis, setColis] = useState<Colis[]>([]);
  const [charge, setCharge] = useState(false);
  const [balai, setBalai] = useState(0);

  const hotel = session?.hotel ?? null;
  const proprietaireId = session?.user?.id ?? hotel?.id ?? null;

  const rafraichir = useCallback(async () => {
    if (!proprietaireId) return;
    setCharge(true);
    try {
      if (hotel) {
        // Les hôtels ont une vraie liste côté API.
        setColis(await api.listerColisHotel(hotel.id));
      } else {
        const ids = await listerColisLocaux(proprietaireId);
        const resultats = await Promise.all(
          ids.map((colisId) => api.obtenirColis(colisId).catch(() => null))
        );
        setColis(resultats.filter((c): c is Colis => c !== null));
      }
      setBalai(await lireCoupDeBalai('colis', proprietaireId));
    } catch {
      // silencieux : l'écran vide affiche l'invite de création
    } finally {
      setCharge(false);
    }
  }, [proprietaireId, hotel]);

  useFocusEffect(
    useCallback(() => {
      rafraichir();
    }, [rafraichir])
  );

  // Colis affichés : les actifs toujours, les livrés/annulés seulement s'ils
  // sont postérieurs au dernier coup de balai.
  const estFini = (c: Colis) =>
    STATUTS_FINIS.includes(champ<StatutColis>(c, 'status', 'statut') ?? 'created');
  const visibles = colis.filter(
    (c) => !estFini(c) || !estBalaye(champ(c, 'created_at', 'createdAt'), balai)
  );
  const nbNettoyables = visibles.filter(estFini).length;

  const faireLeMenage = () => {
    if (!proprietaireId) return;
    Alert.alert(t('menage_titre'), t('menage_texte'), [
      { text: t('commun_annuler'), style: 'cancel' },
      {
        text: t('menage_confirmer'),
        style: 'destructive',
        onPress: async () => setBalai(await passerCoupDeBalai('colis', proprietaireId)),
      },
    ]);
  };

  return (
    <FondPlage fond="lagon" voile="clair">
      <FlatList
        data={visibles}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.liste}
        refreshControl={
          <RefreshControl refreshing={charge} onRefresh={rafraichir} tintColor={couleurs.primaire} />
        }
        ListHeaderComponent={
          <Bouton
            titre={t('colis_envoyer')}
            icone="add-circle-outline"
            onPress={() => router.push('/package/nouveau')}
            style={styles.boutonNouveau}
          />
        }
        ListEmptyComponent={
          !charge ? (
            <EtatVide
              icone="cube-outline"
              titre={t('colis_vide_titre')}
              message={hotel ? t('colis_vide_texte_hotel') : t('colis_vide_texte')}
            />
          ) : null
        }
        ListFooterComponent={
          nbNettoyables > 0 ? (
            <Bouton
              titre={`${t('menage_bouton_colis')} (${nbNettoyables})`}
              icone="trash-outline"
              variante="secondaire"
              onPress={faireLeMenage}
              style={styles.boutonMenage}
            />
          ) : null
        }
        renderItem={({ item }) => {
          const statut = champ<StatutColis>(item, 'status', 'statut');
          const taille = libelleTailleColis(champ<TailleColis>(item, 'size', 'taille'), t);
          return (
            <Pressable
              onPress={() => router.push(`/package/${item.id}`)}
              style={({ pressed }) => [styles.carte, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.enTete}>
                <Text style={styles.destinataire}>
                  {champ(item, 'recipient_name', 'recipientName') ?? t('colis_defaut')}
                </Text>
                <BadgeStatutColis statut={statut} />
              </View>
              <Text style={styles.itineraire}>
                {champ(item, 'pickup_location', 'pickupLocation') ?? '?'}{'  '}
                <Text style={styles.fleche}>→</Text>{'  '}
                {champ(item, 'dropoff_location', 'dropoffLocation') ?? '?'}
              </Text>
              <View style={styles.pied}>
                <Text style={styles.code}>
                  {taille ? `${taille} · ` : ''}
                  {champ(item, 'qr_code', 'qrCode') ?? ''}
                </Text>
                <Text style={styles.prix}>{formaterPrix(item)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </FondPlage>
  );
}

const styles = StyleSheet.create({
  liste: {
    padding: espaces.l,
    gap: espaces.m,
    flexGrow: 1,
  },
  boutonNouveau: {
    marginBottom: espaces.s,
  },
  boutonMenage: {
    marginTop: espaces.m,
  },
  carte: {
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.s,
    ...ombres.carte,
  },
  enTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  destinataire: {
    fontSize: 16,
    fontWeight: '700',
    color: couleurs.encre,
    flexShrink: 1,
  },
  itineraire: {
    fontSize: 15,
    fontWeight: '600',
    color: couleurs.encre,
    lineHeight: 21,
  },
  fleche: {
    color: couleurs.primaire,
    fontWeight: '800',
  },
  pied: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  code: {
    fontSize: 12,
    color: couleurs.texteSecondaire,
    fontFamily: 'monospace',
  },
  prix: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.primaire,
  },
});
