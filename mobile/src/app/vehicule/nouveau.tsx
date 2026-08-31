// NOUVEAU VÉHICULE — l'équipe saisit la fiche complète : le loueur n'a pas
// de compte, c'est nous qui entrons ses documents (assurance, road licence),
// son prix et ses premières photos. Le véhicule démarre 'pending' : il faudra
// le VÉRIFIER (sur sa fiche) avant qu'il sorte au catalogue client.
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ChoixDocument } from '@/components/ChoixDocument';
import { GaleriePhotos } from '@/components/GaleriePhotos';
import { Selecteur } from '@/components/Selecteur';
import { Bouton, Carte, Champ, Ecran, TexteErreur, Titre } from '@/components/ui';
import { api, definirCleEquipe, ErreurApi, type DonneesVehicule } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { lireStockage } from '@/lib/stockage';
import { couleurs, espaces, stylesReactifs } from '@/lib/theme';
import type { Devise } from '@/lib/types';

const CLE_STOCKAGE = 'zanzigo.cle_equipe';
const FORMAT_DATE_OK = (v: string) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);

export default function EcranNouveauVehicule() {
  const router = useRouter();
  const { t } = useT();

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
  // Photos : rien à envoyer au serveur avant que le véhicule existe — on les
  // garde en local (l'url servie par /uploads sert aussi d'identifiant) et on
  // les pose toutes en une fois dans photoUrls à la création.
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);

  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

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

  const creer = async () => {
    setErreur('');
    const prix = Number(dailyPrice);
    const commission = Number(dailyCommission);
    if (
      !category.trim() ||
      !make.trim() ||
      !model.trim() ||
      !plate.trim() ||
      !pickupLocation.trim() ||
      !loueurName.trim() ||
      !loueurPhone.trim() ||
      !Number.isFinite(prix) ||
      !Number.isFinite(commission) ||
      !insuranceDocumentUrl ||
      !roadLicenceDocumentUrl
    ) {
      setErreur(t('vehicule_champs_requis'));
      return;
    }
    if (!FORMAT_DATE_OK(insuranceExpiresOn) || !FORMAT_DATE_OK(roadLicenceExpiresOn)) {
      setErreur(t('equipe_docs_format'));
      return;
    }
    setEnCours(true);
    try {
      const enregistree = await lireStockage(CLE_STOCKAGE);
      if (enregistree) definirCleEquipe(enregistree);
      const donnees: DonneesVehicule = {
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
        insuranceDocumentUrl,
        insuranceExpiresOn: insuranceExpiresOn.trim() || null,
        roadLicenceDocumentUrl,
        roadLicenceExpiresOn: roadLicenceExpiresOn.trim() || null,
        photoUrls: photos.map((p) => p.url),
      };
      const vehicule = await api.creerVehicule(donnees);
      router.replace(`/vehicule/${vehicule.id}`);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('vehicule_erreur'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Ecran fond="vagues">
      {retour}
      <Titre>{t('vehicules_ajouter')}</Titre>
      <TexteErreur>{erreur}</TexteErreur>

      <Carte>
        <Champ label={t('vehicule_champ_categorie')} value={category} onChangeText={setCategory} placeholder="SUV, berline, scooter…" />
        <Champ label={t('vehicule_champ_marque')} value={make} onChangeText={setMake} />
        <Champ label={t('vehicule_champ_modele')} value={model} onChangeText={setModel} />
        <Champ label={t('vehicule_champ_annee')} value={year} onChangeText={setYear} keyboardType="number-pad" />
        <Champ label={t('vehicule_champ_plaque')} value={plate} onChangeText={setPlate} autoCapitalize="characters" />
        <Champ label={t('vehicule_champ_places')} value={seats} onChangeText={setSeats} keyboardType="number-pad" />
        <Champ label={t('vehicule_champ_transmission')} value={transmission} onChangeText={setTransmission} placeholder="Automatique, manuelle…" />
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
        <Selecteur
          label={t('vehicule_champ_devise')}
          valeur={currency}
          options={['USD', 'TZS']}
          onChange={(v) => setCurrency(v as Devise)}
        />
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

      <Carte>
        <Text style={styles.label}>{t('vehicule_photos_titre')}</Text>
        <GaleriePhotos
          photos={photos}
          onAjouter={async (url) => setPhotos((liste) => [...liste, { id: url, url }])}
          onSupprimer={async (id) => setPhotos((liste) => liste.filter((p) => p.id !== id))}
        />
      </Carte>

      <Bouton titre={t('vehicule_creer')} icone="checkmark-circle-outline" onPress={creer} charge={enCours} desactive={enCours} />
    </Ecran>
  );
}

const styles = stylesReactifs(() => ({
  retour: { flexDirection: 'row', alignItems: 'center', gap: espaces.xs, marginBottom: espaces.s },
  texteRetour: { color: couleurs.primaireFonce, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: couleurs.texteSecondaire },
}));
