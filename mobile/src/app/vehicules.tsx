// LOCATION DE VÉHICULES — liste équipe (comme la file chauffeurs/hôtels) :
// tous les véhicules non archivés, le statut de vérification en badge, un
// bouton pour en ajouter un nouveau, une vignette photo par carte et une
// recherche par modèle ou plaque (demande du client, 31/08/2026 — la flotte
// grandit, on ne la parcourt plus à l'œil). Le détail (édition,
// vérification, photos, archivage) vit sur vehicule/[id].tsx ; la création
// sur vehicule/nouveau.tsx.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { IconeCategorie } from '@/components/IconeCategorie';
import {
  Badge,
  Bouton,
  Carte,
  Champ,
  ChargementCentre,
  Ecran,
  EncartInfo,
  EtatVide,
  TexteErreur,
} from '@/components/ui';
import { api, definirCleEquipe, ErreurApi } from '@/lib/api';
import { libelleCategorieVehicule, useT, type CleChaine } from '@/lib/i18n';
import { lireStockage } from '@/lib/stockage';
import { couleurs, espaces, rayons, stylesReactifs } from '@/lib/theme';
import type { VehiculeLocation } from '@/lib/types';

const CLE_STOCKAGE = 'zanzigo.cle_equipe';

const TON_STATUT: Record<string, 'attente' | 'succes' | 'danger'> = {
  pending: 'attente',
  verified: 'succes',
  rejected: 'danger',
};

/** Casse et espaces ignorés : « z675fr » retrouve « Z 675 FR ». */
const normaliser = (texte: string) => texte.toLowerCase().replace(/\s+/g, '');

export default function EcranVehicules() {
  const router = useRouter();
  const { t } = useT();
  const [vehicules, setVehicules] = useState<VehiculeLocation[]>([]);
  const [recherche, setRecherche] = useState('');
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try {
      const enregistree = await lireStockage(CLE_STOCKAGE);
      if (enregistree) definirCleEquipe(enregistree);
      setVehicules(await api.listerVehicules(true));
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('vehicules_erreur'));
    } finally {
      setCharge(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const retour = (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      style={({ pressed }) => [styles.retour, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name="chevron-back" size={18} color={couleurs.primaireFonce} />
      <Text style={styles.texteRetour}>{t('equipe_retour_menu')}</Text>
    </Pressable>
  );

  if (charge) return <ChargementCentre message={t('verif_chargement')} />;

  // La recherche fouille tout ce qui identifie un véhicule : marque, modèle,
  // plaque — et le nom du loueur, que l'équipe connaît souvent mieux.
  const filtre = normaliser(recherche);
  const visibles = filtre
    ? vehicules.filter((v) =>
        normaliser(`${v.make} ${v.model} ${v.plate ?? ''} ${v.loueur_name ?? ''}`).includes(filtre)
      )
    : vehicules;

  return (
    <Ecran fond="vagues" onRefresh={charger}>
      {retour}
      <TexteErreur>{erreur}</TexteErreur>

      <Bouton
        titre={t('vehicules_ajouter')}
        icone="add-circle-outline"
        onPress={() => router.push('/vehicule/nouveau')}
      />

      {vehicules.length > 0 && (
        <Champ
          label={t('vehicules_recherche')}
          value={recherche}
          onChangeText={setRecherche}
          placeholder="Juke, Z 675 FR…"
          autoCapitalize="none"
        />
      )}

      {vehicules.length === 0 ? (
        <EtatVide
          icone="car-sport-outline"
          titre={t('vehicules_vide_titre')}
          message={t('vehicules_vide_message')}
        />
      ) : visibles.length === 0 ? (
        <EncartInfo icone="search-outline" ton="attente">
          {t('equipe_recherche_vide')}
        </EncartInfo>
      ) : (
        visibles.map((vehicule) => (
          <Pressable
            key={vehicule.id}
            onPress={() => router.push(`/vehicule/${vehicule.id}`)}
            accessibilityRole="button"
            style={({ pressed }) => pressed && { opacity: 0.85 }}
          >
            <Carte>
              <View style={styles.ligneVehicule}>
                {/* La vignette : la première photo du véhicule — la même que
                    le client voit au catalogue. Sans photo, la silhouette de
                    sa catégorie. */}
                {vehicule.photos && vehicule.photos.length > 0 ? (
                  <Image
                    source={{ uri: vehicule.photos[0].url }}
                    style={styles.vignette}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.vignette, styles.vignetteVide]}>
                    <IconeCategorie
                      categorie={vehicule.category}
                      taille={30}
                      couleur={couleurs.texteSecondaire}
                    />
                  </View>
                )}
                <View style={styles.colonneTextes}>
                  <View style={styles.ligneTete}>
                    <Text style={styles.titre} numberOfLines={1}>
                      {vehicule.make} {vehicule.model}
                    </Text>
                    <Badge
                      texte={t(`vehicule_statut_${vehicule.verification_status ?? 'pending'}` as CleChaine)}
                      ton={TON_STATUT[vehicule.verification_status ?? 'pending']}
                    />
                  </View>
                  <Text style={styles.details}>
                    {libelleCategorieVehicule(vehicule.category, t)} · {vehicule.plate}
                    {vehicule.archived_at ? ` · ${t('vehicule_statut_archive')}` : ''}
                  </Text>
                  <Text style={styles.prix}>
                    {vehicule.daily_price} {vehicule.currency}
                    {t('location_par_jour')}
                  </Text>
                  {!vehicule.available && !vehicule.archived_at && (
                    <Badge texte={t('vehicule_indisponible')} ton="danger" />
                  )}
                </View>
              </View>
            </Carte>
          </Pressable>
        ))
      )}
    </Ecran>
  );
}

const styles = stylesReactifs(() => ({
  retour: { flexDirection: 'row', alignItems: 'center', gap: espaces.xs, marginBottom: espaces.s },
  texteRetour: { color: couleurs.primaireFonce, fontWeight: '700' },
  ligneVehicule: {
    flexDirection: 'row',
    gap: espaces.m,
    alignItems: 'center',
  },
  vignette: {
    width: 72,
    height: 72,
    borderRadius: rayons.bouton,
    backgroundColor: couleurs.primaireClair,
  },
  vignetteVide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  colonneTextes: {
    flex: 1,
    gap: 3,
  },
  ligneTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  titre: { fontSize: 17, fontWeight: '800', color: couleurs.encre, flexShrink: 1 },
  details: { color: couleurs.texteSecondaire, fontSize: 13.5 },
  prix: { color: couleurs.primaireFonce, fontWeight: '700', fontSize: 15 },
}));
