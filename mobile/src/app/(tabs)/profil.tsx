// Onglet « Profil » : informations du compte (touriste/résident, devise),
// statut de vérification du document résident, déconnexion.
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Bouton, Carte, Ecran, LigneInfo, SousTitre } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { couleurs, espaces } from '@/lib/theme';
import { champ, type StatutVerification, type TypeCompte } from '@/lib/types';

export default function EcranProfil() {
  const router = useRouter();
  const { session, deconnexion, majSession } = useAuth();
  const utilisateur = session?.user ?? null;
  const hotel = session?.hotel ?? null;
  const [chargeMaj, setChargeMaj] = useState(false);

  const typeCompte = champ<TypeCompte>(utilisateur, 'account_type', 'accountType');
  const estResident = typeCompte === 'resident';
  // Touriste : vérifié d'office. Résident : pending → verified/rejected
  // (validation manuelle du document d'identité par l'équipe).
  const statutVerif =
    champ<StatutVerification>(utilisateur, 'verification_status', 'verificationStatus') ??
    'pending';
  const devise = champ<string>(utilisateur, 'currency');

  // Recharge le profil (utile pour voir la validation résident arriver).
  const actualiser = async () => {
    if (!utilisateur) return;
    setChargeMaj(true);
    try {
      const maj = await api.obtenirUtilisateur(utilisateur.id);
      await majSession({ user: maj });
    } catch {
      // silencieux : le profil affiché reste celui de la session
    } finally {
      setChargeMaj(false);
    }
  };

  const seDeconnecter = async () => {
    await deconnexion();
    router.replace('/');
  };

  return (
    <Ecran>
      <Carte style={styles.carteIdentite}>
        <View style={styles.avatar}>
          <Text style={styles.initiale}>
            {String(champ(utilisateur ?? hotel, 'full_name', 'fullName', 'name') ?? 'z')
              .charAt(0)
              .toUpperCase()}
          </Text>
        </View>
        <Text style={styles.nom}>
          {String(
            champ(utilisateur ?? hotel, 'full_name', 'fullName', 'name') ?? 'Compte zanziGo'
          )}
        </Text>
        <SousTitre>{session?.phone ?? ''}</SousTitre>
        {utilisateur && (
          <Badge
            texte={
              statutVerif === 'verified'
                ? 'Compte vérifié'
                : statutVerif === 'rejected'
                  ? 'Vérification refusée'
                  : 'Vérification en attente'
            }
            ton={
              statutVerif === 'verified'
                ? 'succes'
                : statutVerif === 'rejected'
                  ? 'danger'
                  : 'attente'
            }
          />
        )}
        {hotel && <Badge texte="Compte hôtel" ton="primaire" />}
      </Carte>

      {estResident && statutVerif === 'pending' && (
        <Carte>
          <SousTitre>
            Compte résident en attente de validation : l&apos;équipe zanziGo vérifie votre
            document d&apos;identité. Le tarif local (partagée locale) sera activé une fois le
            compte vérifié.
          </SousTitre>
        </Carte>
      )}
      {estResident && statutVerif === 'rejected' && (
        <Carte>
          <SousTitre>
            Votre document d&apos;identité a été refusé par l&apos;équipe. Contactez-nous sur
            WhatsApp pour le mettre à jour.
          </SousTitre>
        </Carte>
      )}

      <Carte>
        <LigneInfo label="Téléphone" valeur={session?.phone ?? '—'} />
        <LigneInfo label="E-mail" valeur={String(champ(utilisateur, 'email') ?? '—')} />
        <LigneInfo
          label="Type de compte"
          valeur={hotel ? 'Hôtel' : estResident ? 'Résident' : 'Touriste'}
        />
        <LigneInfo label="Devise" valeur={devise ?? (hotel ? 'TZS' : '—')} />
      </Carte>

      {utilisateur && (
        <Bouton
          titre="Actualiser mon profil"
          variante="secondaire"
          onPress={actualiser}
          charge={chargeMaj}
        />
      )}
      <Bouton titre="Se déconnecter" variante="danger" onPress={seDeconnecter} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  carteIdentite: {
    alignItems: 'center',
    gap: espaces.s,
    paddingVertical: espaces.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: couleurs.primaire,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initiale: {
    fontSize: 30,
    fontWeight: '800',
    color: couleurs.blanc,
  },
  nom: {
    fontSize: 20,
    fontWeight: '700',
    color: couleurs.encre,
  },
});
