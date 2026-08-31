// FICHE VÉHICULE (équipe) — édition des champs, vérification (comme un
// dossier chauffeur), galerie de photos, disponibilité, archivage définitif.
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';

import { ChoixDocument } from '@/components/ChoixDocument';
import { GaleriePhotos } from '@/components/GaleriePhotos';
import { Selecteur } from '@/components/Selecteur';
import {
  Badge,
  Bouton,
  Carte,
  ChargementCentre,
  Ecran,
  Champ,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, definirCleEquipe, ErreurApi } from '@/lib/api';
import { useT, type CleChaine } from '@/lib/i18n';
import { lireStockage } from '@/lib/stockage';
import { couleurs, espaces, stylesReactifs } from '@/lib/theme';
import type { Devise, VehiculeLocation } from '@/lib/types';

const CLE_STOCKAGE = 'zanzigo.cle_equipe';
const FORMAT_DATE_OK = (v: string) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);

const TON_STATUT: Record<string, 'attente' | 'succes' | 'danger'> = {
  pending: 'attente',
  verified: 'succes',
  rejected: 'danger',
};

export default function EcranFicheVehicule() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT();

  const [vehicule, setVehicule] = useState<VehiculeLocation | null>(null);
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [actionEnCours, setActionEnCours] = useState('');

  // Champs éditables — copie locale, envoyée d'un bloc via « Enregistrer ».
  const [category, setCategory] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [plate, setPlate] = useState('');
  const [seats, setSeats] = useState('');
  const [transmission, setTransmission] = useState('');
  const [description, setDescription] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [loueurName, setLoueurName] = useState('');
  const [loueurPhone, setLoueurPhone] = useState('');
  const [dailyPrice, setDailyPrice] = useState('');
  const [dailyCommission, setDailyCommission] = useState('');
  const [currency, setCurrency] = useState<Devise>('USD');
  const [insuranceDocumentUrl, setInsuranceDocumentUrl] = useState<string | null>(null);
  const [insuranceExpiresOn, setInsuranceExpiresOn] = useState('');
  const [roadLicenceDocumentUrl, setRoadLicenceDocumentUrl] = useState<string | null>(null);
  const [roadLicenceExpiresOn, setRoadLicenceExpiresOn] = useState('');

  const remplirDepuis = (v: VehiculeLocation) => {
    setCategory(v.category);
    setMake(v.make);
    setModel(v.model);
    setYear(v.year != null ? String(v.year) : '');
    setPlate(v.plate ?? '');
    setSeats(v.seats != null ? String(v.seats) : '');
    setTransmission(v.transmission ?? '');
    setDescription(v.description ?? '');
    setPickupLocation(v.pickup_location);
    setLoueurName(v.loueur_name ?? '');
    setLoueurPhone(v.loueur_phone ?? '');
    setDailyPrice(String(v.daily_price));
    setDailyCommission(v.daily_commission != null ? String(v.daily_commission) : '');
    setCurrency(v.currency);
    setInsuranceDocumentUrl(v.insurance_document_url ?? null);
    setInsuranceExpiresOn(v.insurance_expires_on ?? '');
    setRoadLicenceDocumentUrl(v.road_licence_document_url ?? null);
    setRoadLicenceExpiresOn(v.road_licence_expires_on ?? '');
  };

  const charger = useCallback(async () => {
    if (!id) return;
    const enregistree = await lireStockage(CLE_STOCKAGE);
    if (enregistree) definirCleEquipe(enregistree);
    try {
      const v = await api.obtenirVehicule(id, true);
      setVehicule(v);
      remplirDepuis(v);
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('vehicules_erreur'));
    } finally {
      setCharge(false);
    }
  }, [id, t]);

  useEffect(() => {
    charger();
  }, [charger]);

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
  if (!vehicule) {
    return (
      <Ecran fond="vagues">
        {retour}
        <TexteErreur>{erreur || t('vehicules_erreur')}</TexteErreur>
      </Ecran>
    );
  }

  const enregistrer = async () => {
    setErreur('');
    setMessage('');
    const prix = Number(dailyPrice);
    const commission = Number(dailyCommission);
    if (!Number.isFinite(prix) || !Number.isFinite(commission)) {
      setErreur(t('vehicule_champs_requis'));
      return;
    }
    if (!FORMAT_DATE_OK(insuranceExpiresOn) || !FORMAT_DATE_OK(roadLicenceExpiresOn)) {
      setErreur(t('equipe_docs_format'));
      return;
    }
    setActionEnCours('enregistrer');
    try {
      const v = await api.majVehicule(vehicule.id, {
        category: category.trim(),
        make: make.trim(),
        model: model.trim(),
        year: year.trim() ? Number(year) : null,
        plate: plate.trim(),
        seats: seats.trim() ? Number(seats) : null,
        transmission: transmission.trim() || null,
        description: description.trim() || null,
        pickupLocation: pickupLocation.trim(),
        loueurName: loueurName.trim(),
        loueurPhone: loueurPhone.trim(),
        dailyPrice: prix,
        dailyCommission: commission,
        currency,
        insuranceDocumentUrl: insuranceDocumentUrl ?? undefined,
        insuranceExpiresOn: insuranceExpiresOn.trim() || null,
        roadLicenceDocumentUrl: roadLicenceDocumentUrl ?? undefined,
        roadLicenceExpiresOn: roadLicenceExpiresOn.trim() || null,
      });
      setVehicule(v);
      remplirDepuis(v);
      setMessage(t('vehicule_enregistrer'));
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('vehicule_erreur'));
    } finally {
      setActionEnCours('');
    }
  };

  const verifier = async (statut: 'verified' | 'rejected') => {
    setErreur('');
    setActionEnCours(statut);
    try {
      const v = await api.verifierVehicule(vehicule.id, statut);
      setVehicule(v);
      remplirDepuis(v);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('vehicule_erreur'));
    } finally {
      setActionEnCours('');
    }
  };

  const basculerDisponibilite = async () => {
    setErreur('');
    setActionEnCours('disponibilite');
    try {
      const v = await api.majVehicule(vehicule.id, { available: !vehicule.available });
      setVehicule(v);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('vehicule_erreur'));
    } finally {
      setActionEnCours('');
    }
  };

  const archiver = () => {
    Alert.alert(t('vehicule_archiver'), t('vehicule_archiver_confirmation'), [
      { text: t('commun_annuler'), style: 'cancel' },
      {
        text: t('vehicule_archiver'),
        style: 'destructive',
        onPress: async () => {
          setActionEnCours('archiver');
          try {
            await api.archiverVehicule(vehicule.id);
            router.back();
          } catch (e) {
            setErreur(e instanceof ErreurApi ? e.message : t('vehicule_erreur'));
          } finally {
            setActionEnCours('');
          }
        },
      },
    ]);
  };

  const ajouterPhoto = async (url: string) => {
    const photo = await api.ajouterPhotoVehicule(vehicule.id, url);
    setVehicule((v: VehiculeLocation | null) => (v ? { ...v, photos: [...v.photos, photo] } : v));
  };
  const supprimerPhoto = async (photoId: string) => {
    await api.supprimerPhotoVehicule(vehicule.id, photoId);
    setVehicule((v: VehiculeLocation | null) =>
      v ? { ...v, photos: v.photos.filter((p: { id: string }) => p.id !== photoId) } : v
    );
  };

  return (
    <Ecran fond="vagues" onRefresh={charger}>
      {retour}
      <Titre>
        {vehicule.make} {vehicule.model}
      </Titre>
      <Badge
        texte={t(`vehicule_statut_${vehicule.verification_status ?? 'pending'}` as CleChaine)}
        ton={TON_STATUT[vehicule.verification_status ?? 'pending']}
      />
      <TexteErreur>{erreur}</TexteErreur>
      {!!message && <Badge texte={message} ton="succes" />}

      <Carte>
        <Titre>{t('vehicule_verifier_titre')}</Titre>
        <Bouton
          titre={t('vehicule_valider')}
          icone="checkmark-circle-outline"
          onPress={() => verifier('verified')}
          charge={actionEnCours === 'verified'}
          desactive={!!actionEnCours || vehicule.verification_status === 'verified'}
        />
        <Bouton
          titre={t('vehicule_refuser')}
          icone="close-circle-outline"
          variante="danger"
          onPress={() => verifier('rejected')}
          charge={actionEnCours === 'rejected'}
          desactive={!!actionEnCours || vehicule.verification_status === 'rejected'}
        />
        <Bouton
          titre={vehicule.available ? t('vehicule_indisponible') : t('vehicule_disponible')}
          icone={vehicule.available ? 'pause-circle-outline' : 'play-circle-outline'}
          variante="secondaire"
          onPress={basculerDisponibilite}
          charge={actionEnCours === 'disponibilite'}
          desactive={!!actionEnCours}
        />
      </Carte>

      <Carte>
        <Text style={styles.label}>{t('vehicule_photos_titre')}</Text>
        <GaleriePhotos photos={vehicule.photos} onAjouter={ajouterPhoto} onSupprimer={supprimerPhoto} />
      </Carte>

      <Carte>
        <Champ label={t('vehicule_champ_categorie')} value={category} onChangeText={setCategory} />
        <Champ label={t('vehicule_champ_marque')} value={make} onChangeText={setMake} />
        <Champ label={t('vehicule_champ_modele')} value={model} onChangeText={setModel} />
        <Champ label={t('vehicule_champ_annee')} value={year} onChangeText={setYear} keyboardType="number-pad" />
        <Champ label={t('vehicule_champ_plaque')} value={plate} onChangeText={setPlate} autoCapitalize="characters" />
        <Champ label={t('vehicule_champ_places')} value={seats} onChangeText={setSeats} keyboardType="number-pad" />
        <Champ label={t('vehicule_champ_transmission')} value={transmission} onChangeText={setTransmission} />
        <Champ label={t('vehicule_champ_description')} value={description} onChangeText={setDescription} multiline />
        <Champ label={t('vehicule_champ_lieu_retrait')} value={pickupLocation} onChangeText={setPickupLocation} />
      </Carte>

      <Carte>
        <Champ label={t('vehicule_champ_loueur_nom')} value={loueurName} onChangeText={setLoueurName} />
        <Champ label={t('vehicule_champ_loueur_telephone')} value={loueurPhone} onChangeText={setLoueurPhone} keyboardType="phone-pad" />
      </Carte>

      <Carte>
        <Champ label={t('vehicule_champ_prix_jour')} value={dailyPrice} onChangeText={setDailyPrice} keyboardType="decimal-pad" />
        <Champ label={t('vehicule_champ_commission_jour')} value={dailyCommission} onChangeText={setDailyCommission} keyboardType="decimal-pad" />
        <Selecteur label={t('vehicule_champ_devise')} valeur={currency} options={['USD', 'TZS']} onChange={(v) => setCurrency(v as Devise)} />
      </Carte>

      <Carte>
        <ChoixDocument
          uri={insuranceDocumentUrl}
          onFichier={setInsuranceDocumentUrl}
          onErreur={setErreur}
          label={t('vehicule_doc_assurance')}
          texteAjouter={t('vehicule_doc_assurance_ajouter')}
          texteAjoute={t('vehicule_doc_assurance_ajoute')}
          texteChanger={t('vehicule_doc_changer')}
        />
        <Champ
          label={t('vehicule_champ_assurance_expiration')}
          value={insuranceExpiresOn}
          onChangeText={setInsuranceExpiresOn}
          placeholder="2026-12-31"
        />
        <ChoixDocument
          uri={roadLicenceDocumentUrl}
          onFichier={setRoadLicenceDocumentUrl}
          onErreur={setErreur}
          label={t('vehicule_doc_road_licence')}
          texteAjouter={t('vehicule_doc_road_licence_ajouter')}
          texteAjoute={t('vehicule_doc_road_licence_ajoute')}
          texteChanger={t('vehicule_doc_changer')}
        />
        <Champ
          label={t('vehicule_champ_road_licence_expiration')}
          value={roadLicenceExpiresOn}
          onChangeText={setRoadLicenceExpiresOn}
          placeholder="2026-12-31"
        />
      </Carte>

      <Bouton
        titre={t('vehicule_enregistrer')}
        icone="save-outline"
        onPress={enregistrer}
        charge={actionEnCours === 'enregistrer'}
        desactive={!!actionEnCours}
      />

      {!vehicule.archived_at && (
        <Bouton
          titre={t('vehicule_archiver')}
          icone="archive-outline"
          variante="danger"
          onPress={archiver}
          charge={actionEnCours === 'archiver'}
          desactive={!!actionEnCours}
        />
      )}
    </Ecran>
  );
}

const styles = stylesReactifs(() => ({
  retour: { flexDirection: 'row', alignItems: 'center', gap: espaces.xs, marginBottom: espaces.s },
  texteRetour: { color: couleurs.primaireFonce, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: couleurs.texteSecondaire },
}));
