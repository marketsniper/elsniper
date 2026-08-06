// Écran d'information pour les candidatures chauffeur / hôtel (MVP : via l'équipe).
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Linking } from 'react-native';

import { Bouton, Carte, Ecran, SousTitre, Titre } from '@/components/ui';

// Numéro WhatsApp de l'équipe zanziGo (placeholder MVP).
const WHATSAPP_EQUIPE = 'https://wa.me/255779000000';

export default function EcranPro() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const estHotel = params.type === 'hotel';

  return (
    <Ecran>
      <Carte>
        <Titre>{estHotel ? 'Partenariat hôtel' : 'Devenir chauffeur'}</Titre>
        <SousTitre>
          {estHotel
            ? "Au lancement, les comptes hôtels sont créés par l'équipe zanziGo : envois de colis pour vos clients, navettes aéroport et facturation regroupée."
            : "Au lancement, les candidatures chauffeur passent par l'équipe zanziGo : permis, véhicule et assurance sont vérifiés avant l'activation de votre compte."}
        </SousTitre>
        <SousTitre>
          Contactez-nous sur WhatsApp, nous revenons vers vous sous 48 h. Une fois votre compte
          activé, reconnectez-vous simplement avec votre numéro de téléphone.
        </SousTitre>
        <Bouton
          titre="Contacter l'équipe sur WhatsApp"
          onPress={() => Linking.openURL(WHATSAPP_EQUIPE)}
        />
        <Bouton titre="Retour" variante="secondaire" onPress={() => router.back()} />
      </Carte>
    </Ecran>
  );
}
