// Onglet « Colis » : liste des colis envoyés + création.
// Hôtel : liste via GET /hotels/:id/packages. Utilisateur : l'API n'expose
// pas de liste par expéditeur → ids mémorisés localement (lib/colisLocal)
// puis rechargés via GET /packages/:id.
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Badge, Bouton, SousTitre } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { listerColisLocaux } from '@/lib/colisLocal';
import { couleurs, espaces, rayons } from '@/lib/theme';
import {
  champ,
  formaterPrix,
  LIBELLES_STATUT_COLIS,
  type Colis,
  type StatutColis,
} from '@/lib/types';

function tonStatut(statut: StatutColis | undefined) {
  switch (statut) {
    case 'delivered':
      return 'succes' as const;
    case 'created':
      return 'attente' as const;
    default:
      return 'primaire' as const;
  }
}

export default function EcranColis() {
  const router = useRouter();
  const { session } = useAuth();
  const [colis, setColis] = useState<Colis[]>([]);
  const [charge, setCharge] = useState(false);

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

  return (
    <View style={styles.conteneur}>
      <FlatList
        data={colis}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.liste}
        refreshControl={
          <RefreshControl refreshing={charge} onRefresh={rafraichir} tintColor={couleurs.primaire} />
        }
        ListHeaderComponent={
          <Bouton
            titre="+ Envoyer un colis"
            onPress={() => router.push('/package/nouveau')}
            style={styles.boutonNouveau}
          />
        }
        ListEmptyComponent={
          <View style={styles.vide}>
            <SousTitre>
              Aucun colis pour le moment. Créez votre premier envoi !
            </SousTitre>
          </View>
        }
        renderItem={({ item }) => {
          const statut = champ<StatutColis>(item, 'status', 'statut');
          return (
            <Pressable
              onPress={() => router.push(`/package/${item.id}`)}
              style={({ pressed }) => [styles.carte, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.enTete}>
                <Text style={styles.destinataire}>
                  {champ(item, 'recipient_name', 'recipientName') ?? 'Colis'}
                </Text>
                <Badge
                  texte={statut ? LIBELLES_STATUT_COLIS[statut] ?? statut : '—'}
                  ton={tonStatut(statut)}
                />
              </View>
              <Text style={styles.itineraire}>
                {champ(item, 'pickup_location', 'pickupLocation') ?? '?'} →{' '}
                {champ(item, 'dropoff_location', 'dropoffLocation') ?? '?'}
              </Text>
              <View style={styles.pied}>
                <Text style={styles.code}>{champ(item, 'qr_code', 'qrCode') ?? ''}</Text>
                <Text style={styles.prix}>{formaterPrix(item)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: {
    flex: 1,
    backgroundColor: couleurs.sable,
  },
  liste: {
    padding: espaces.l,
    gap: espaces.m,
    flexGrow: 1,
  },
  boutonNouveau: {
    marginBottom: espaces.s,
  },
  vide: {
    alignItems: 'center',
    paddingTop: espaces.xl,
  },
  carte: {
    backgroundColor: couleurs.blanc,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.s,
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
  },
  itineraire: {
    fontSize: 14,
    color: couleurs.encre,
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
