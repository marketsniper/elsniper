// Petit calendrier mensuel, en composants React Native purs — il s'affiche à
// l'identique sur le web (PWA) et en natif. On tape directement sur le jour
// voulu, au lieu de faire défiler une longue liste de dates.
//
// Bornes : rien avant aujourd'hui, rien après « aujourd'hui + maxJours ». Les
// flèches de mois se désactivent aux extrémités. Semaine commençant le lundi.
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { Langue } from '@/lib/i18n';
import { couleurs, espaces, rayons, stylesReactifs } from '@/lib/theme';

const LOCALES: Record<Langue, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  sw: 'sw-TZ',
  it: 'it-IT',
  de: 'de-DE',
};

// Date locale ramenée à minuit (comparaisons de jours, sans l'heure).
const aMinuit = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// « yyyy-mm-dd » en heure locale (jamais toISOString, qui décalerait le jour).
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const memeMois = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

export function CalendrierDate({
  valeur,
  onChange,
  maxJours,
  langue,
}: {
  valeur: string; // « yyyy-mm-dd » ou ''
  onChange: (date: string) => void;
  maxJours: number;
  langue: Langue;
}) {
  const locale = LOCALES[langue] ?? 'fr-FR';
  const aujourdHui = aMinuit(new Date());
  const maxDate = aMinuit(
    new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), aujourdHui.getDate() + maxJours)
  );
  const selection = valeur ? aMinuit(new Date(`${valeur}T00:00:00`)) : null;
  const ancre = selection ?? aujourdHui;
  const [mois, setMois] = useState<Date>(new Date(ancre.getFullYear(), ancre.getMonth(), 1));

  // 1er janvier 2024 était un LUNDI : sert de référence pour les initiales des
  // jours (L M M J V S D dans la langue active).
  const joursSemaine = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' })
  );

  const premier = new Date(mois.getFullYear(), mois.getMonth(), 1);
  const decalage = (premier.getDay() + 6) % 7; // lundi = colonne 0
  const nbJours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
  const cases: (Date | null)[] = [
    ...Array<null>(decalage).fill(null),
    ...Array.from({ length: nbJours }, (_, i) => new Date(mois.getFullYear(), mois.getMonth(), i + 1)),
  ];

  const debutMaxMois = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  const peutReculer = !memeMois(mois, aujourdHui);
  const peutAvancer = mois < debutMaxMois;
  const changerMois = (delta: number) =>
    setMois((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <View style={styles.cadre}>
      <View style={styles.entete}>
        <Pressable
          onPress={() => peutReculer && changerMois(-1)}
          disabled={!peutReculer}
          hitSlop={10}
          accessibilityRole="button"
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={peutReculer ? couleurs.primaireFonce : couleurs.bordure}
          />
        </Pressable>
        <Text style={styles.moisTitre}>
          {mois.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable
          onPress={() => peutAvancer && changerMois(1)}
          disabled={!peutAvancer}
          hitSlop={10}
          accessibilityRole="button"
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={peutAvancer ? couleurs.primaireFonce : couleurs.bordure}
          />
        </Pressable>
      </View>

      <View style={styles.ligneSemaine}>
        {joursSemaine.map((j, i) => (
          <Text key={i} style={styles.jourSemaine}>
            {j}
          </Text>
        ))}
      </View>

      <View style={styles.grille}>
        {cases.map((jour, i) => {
          if (!jour) return <View key={`v${i}`} style={styles.caseVide} />;
          const jm = aMinuit(jour);
          const desactive = jm < aujourdHui || jm > maxDate;
          const estSel = !!selection && jm.getTime() === selection.getTime();
          const estAuj = jm.getTime() === aujourdHui.getTime();
          return (
            <Pressable
              key={ymd(jm)}
              disabled={desactive}
              onPress={() => onChange(ymd(jm))}
              accessibilityRole="button"
              style={({ pressed }) => [styles.case, pressed && !desactive && { opacity: 0.6 }]}
            >
              <View
                style={[
                  styles.pastille,
                  estSel && styles.pastilleSelection,
                  estAuj && !estSel && styles.pastilleAujourdhui,
                ]}
              >
                <Text
                  style={[
                    styles.jour,
                    estSel && styles.jourSelection,
                    desactive && styles.jourDesactive,
                  ]}
                >
                  {jour.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = stylesReactifs(() => ({
  cadre: {
    backgroundColor: couleurs.surface,
    borderRadius: rayons.carte,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espaces.m,
    gap: espaces.s,
  },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espaces.xs,
  },
  moisTitre: {
    fontSize: 16,
    fontWeight: '800',
    color: couleurs.encre,
    textTransform: 'capitalize',
  },
  ligneSemaine: {
    flexDirection: 'row',
  },
  jourSemaine: {
    flexBasis: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: couleurs.texteSecondaire,
    textTransform: 'uppercase',
  },
  grille: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  case: {
    flexBasis: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caseVide: {
    flexBasis: `${100 / 7}%`,
    aspectRatio: 1,
  },
  pastille: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastilleSelection: {
    backgroundColor: couleurs.primaire,
  },
  pastilleAujourdhui: {
    borderWidth: 1.5,
    borderColor: couleurs.primaire,
  },
  jour: {
    fontSize: 15,
    color: couleurs.encre,
  },
  jourSelection: {
    color: couleurs.surPrimaire,
    fontWeight: '800',
  },
  jourDesactive: {
    color: couleurs.bordure,
  },
}));
