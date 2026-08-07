// Onglet « Profil » : informations du compte (touriste/résident/hôtel,
// devise), statut de vérification du document résident, déconnexion.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  Bouton,
  Carte,
  Ecran,
  EncartInfo,
  LigneInfo,
  SousTitre,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { couleurs, espaces, tailles } from '@/lib/theme';
import { champ, type StatutVerification, type TypeCompte } from '@/lib/types';

/** Initiales (2 lettres max) d'un nom complet. */
function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return 'Z';
  const premiere = mots[0].charAt(0);
  const seconde = mots.length > 1 ? mots[mots.length - 1].charAt(0) : '';
  return (premiere + seconde).toUpperCase();
}

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
  const nomAffiche = String(
    champ(utilisateur ?? hotel, 'full_name', 'fullName', 'name') ?? 'Compte zanziGo'
  );

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
          <Text style={styles.initiale}>{initiales(nomAffiche)}</Text>
        </View>
        <Text style={styles.nom}>{nomAffiche}</Text>
        <SousTitre>{session?.phone ?? ''}</SousTitre>
        {utilisateur && estResident && (
          <Badge
            texte={
              statutVerif === 'verified'
                ? 'Résident vérifié ✓'
                : statutVerif === 'rejected'
                  ? 'Vérification refusée'
                  : 'En attente de validation'
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
        {utilisateur && !estResident && <Badge texte="Compte vérifié ✓" ton="succes" />}
        {hotel && <Badge texte="Hôtel partenaire" ton="primaire" />}
      </Carte>

      {estResident && statutVerif === 'pending' && (
        <EncartInfo icone="hourglass-outline" ton="attente">
          Compte résident en attente de validation : l&apos;équipe zanziGo vérifie votre
          document d&apos;identité. Le tarif local (navette locale) sera activé une fois le
          compte vérifié.
        </EncartInfo>
      )}
      {estResident && statutVerif === 'rejected' && (
        <EncartInfo icone="alert-circle-outline" ton="attente">
          Votre document d&apos;identité a été refusé par l&apos;équipe. Contactez-nous sur
          WhatsApp pour le mettre à jour.
        </EncartInfo>
      )}

      <Carte>
        <LigneInfo label="Téléphone" valeur={session?.phone || '—'} />
        <LigneInfo
          label="E-mail"
          valeur={String(champ(utilisateur ?? hotel, 'email') ?? '—')}
        />
        <LigneInfo
          label="Type de compte"
          valeur={hotel ? 'Hôtel partenaire' : estResident ? 'Résident' : 'Touriste'}
        />
        {hotel && (
          <>
            <LigneInfo label="Contact" valeur={String(champ(hotel, 'contact_name', 'contactName') ?? '—')} />
            <LigneInfo label="Zone" valeur={String(champ(hotel, 'zone') ?? '—')} />
          </>
        )}
        <LigneInfo label="Devise" valeur={devise ?? (hotel ? 'TZS' : '—')} />
      </Carte>

      {utilisateur && (
        <Bouton
          titre="Actualiser mon profil"
          icone="refresh-outline"
          variante="secondaire"
          onPress={actualiser}
          charge={chargeMaj}
        />
      )}

      <Pressable
        onPress={seDeconnecter}
        style={({ pressed }) => [styles.ligneDeconnexion, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
      >
        <Ionicons name="log-out-outline" size={20} color={couleurs.danger} />
        <Text style={styles.texteDeconnexion}>Se déconnecter</Text>
      </Pressable>
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
    width: tailles.avatar,
    height: tailles.avatar,
    borderRadius: tailles.avatar / 2,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initiale: {
    fontSize: 28,
    fontWeight: '800',
    color: couleurs.primaireFonce,
  },
  nom: {
    fontSize: 20,
    fontWeight: '700',
    color: couleurs.encre,
  },
  ligneDeconnexion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.s,
    paddingVertical: espaces.l,
    marginTop: espaces.s,
  },
  texteDeconnexion: {
    fontSize: 15,
    fontWeight: '600',
    color: couleurs.danger,
  },
});
