// E-mails transactionnels zanziGo — envoi via l'API Brevo (recommandé :
// gratuit, simple vérification d'adresse) ou Resend (demande un domaine),
// en simple requête HTTPS, aucune dépendance. Sans clé : mode STUB,
// l'e-mail est journalisé et rien d'autre. Règle d'or : un e-mail qui
// échoue ne doit JAMAIS faire échouer l'inscription — tout est attrapé ici.
import { config } from '../config.js';
import { envoyerPush } from './pushService.js';

export function isEmailStub() {
  return !config.emailer.brevoApiKey && !config.emailer.resendApiKey;
}

// « zanziGo <adresse@example.com> » → { name, email } (format Brevo).
function expediteur() {
  const brut = config.emailer.from;
  const m = brut.match(/^(.*)<(.+)>$/);
  if (m) return { name: m[1].trim() || 'zanziGo', email: m[2].trim() };
  return { name: 'zanziGo', email: brut.trim() };
}

// Envoi « au mieux » : renvoie { sent } et n'émet jamais d'exception.
export async function envoyerEmail({ to, subject, html }) {
  if (!to) return { sent: false, reason: 'no_recipient' };
  if (isEmailStub()) {
    console.log(`[email stub] à ${to} — ${subject}`);
    return { sent: false, stub: true };
  }
  try {
    const brevo = Boolean(config.emailer.brevoApiKey);
    const reponse = brevo
      ? await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': config.emailer.brevoApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: expediteur(),
            to: [{ email: to }],
            subject,
            htmlContent: html,
          }),
        })
      : await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.emailer.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: config.emailer.from, to, subject, html }),
        });
    if (!reponse.ok) {
      console.error(`[email] échec (${reponse.status}) pour ${to}`);
      return { sent: false, reason: `status_${reponse.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error(`[email] erreur réseau pour ${to}: ${err.message}`);
    return { sent: false, reason: 'network' };
  }
}

// ---------------------------------------------------------------------------
// Gabarits — mise en page simple et robuste (tableaux + styles inline),
// aux couleurs zanziGo (orange corail #E4572E sur sable #FBF0E4).
// ---------------------------------------------------------------------------

const URL_APP = 'https://zanzigo-api.onrender.com/app';
const URL_WEB = 'https://zanzigo-api.onrender.com/web';
const WHATSAPP_EQUIPE = 'https://wa.me/255666241749';

function gabarit(titre, corps) {
  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#FBF0E4;font-family:Arial,Helvetica,sans-serif;color:#33222B;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF0E4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFDFA;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#E4572E;padding:20px 28px;">
          <span style="font-size:24px;font-weight:800;color:#FFF8F2;">zanziGo</span>
          <span style="font-size:13px;color:#FFD9CC;"> · taxi &amp; colis à Zanzibar</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#33222B;">${titre}</h1>
          ${corps}
          <p style="margin:24px 0 0;font-size:13px;color:#8A7168;">
            Une question ? Écrivez-nous sur WhatsApp :
            <a href="${WHATSAPP_EQUIPE}" style="color:#E4572E;font-weight:700;">+255 666 241 749</a><br>
            Karibu Zanzibar 🌴 — l'équipe zanziGo
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ligne(label, valeur) {
  return `<tr>
    <td style="padding:6px 0;font-size:14px;color:#8A7168;">${label}</td>
    <td style="padding:6px 0;font-size:14px;font-weight:700;color:#33222B;text-align:right;">${valeur}</td>
  </tr>`;
}

function bouton(url, texte) {
  return `<p style="margin:20px 0;text-align:center;">
    <a href="${url}" style="display:inline-block;background:#E4572E;color:#FFF8F2;text-decoration:none;font-weight:700;font-size:15px;padding:12px 28px;border-radius:12px;">${texte}</a>
  </p>`;
}

/**
 * Notification AUTOMATIQUE de l'équipe : chaque action sur la plateforme
 * (réservation, colis posté, annonce publiée, annulation, paiement crédit…)
 * arrive TOUTE SEULE sur le téléphone de l'équipe — le client n'a plus rien
 * à envoyer lui-même. Canal préféré : WHATSAPP via la passerelle CallMeBot
 * (clé CALLMEBOT_APIKEY) ; à défaut, e-mail vers TEAM_EMAIL ; sans aucun
 * canal, simple journal. `texte` : les mêmes lignes que le résumé WhatsApp.
 * Fire-and-forget : jamais bloquant, jamais d'exception.
 */
export async function notifierEquipe(sujet, texte) {
  // 0. ALERTE INSTANTANÉE sur le téléphone de l'équipe (notification web).
  // Elle part la première et arrive en une à trois secondes, là où la
  // passerelle WhatsApp gratuite met une trentaine de secondes à remettre
  // son message. Les deux partent : le push prévient, WhatsApp archive.
  envoyerPush(sujet, texte).catch(() => {});

  // 1. WhatsApp (CallMeBot) — le canal que l'équipe lit en premier.
  // Chaque tentative est JOURNALISÉE (succès compris) : les journaux Render
  // permettent de vérifier qu'une notification est bien partie.
  const { apiKey, phone } = config.callmebot;
  if (apiKey && phone) {
    try {
      const url =
        'https://api.callmebot.com/whatsapp.php' +
        `?phone=${encodeURIComponent(phone)}` +
        `&apikey=${encodeURIComponent(apiKey)}` +
        `&text=${encodeURIComponent(`${sujet}\n${texte}`)}`;
      const reponse = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const corps = await reponse.text().catch(() => '');
      // CallMeBot répond 200 même en cas d'erreur : la preuve d'envoi est le
      // « Message queued » dans le corps de la réponse.
      if (reponse.ok && /queued|sent/i.test(corps)) {
        console.log(`[notif équipe] WhatsApp OK — ${sujet}`);
        return { sent: true, channel: 'whatsapp' };
      }
      console.error(
        `[notif équipe] WhatsApp CallMeBot en échec (${reponse.status}: ${corps.replace(/<[^>]+>/g, ' ').trim().slice(0, 120)}) — bascule e-mail`
      );
    } catch (err) {
      console.error(`[notif équipe] WhatsApp CallMeBot injoignable (${err.message}) — bascule e-mail`);
    }
  }

  // 2. E-mail (secours).
  const destinataire = config.emailer.teamEmail;
  if (destinataire) {
    const corps = `
    <p style="margin:0 0 12px;font-size:15px;line-height:24px;white-space:pre-line;">${String(texte)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')}</p>
    <p style="margin:0;font-size:13px;color:#8A7168;">Notification automatique zanziGo — le tableau de bord équipe a le détail.</p>`;
    try {
      const resultat = await envoyerEmail({ to: destinataire, subject: sujet, html: gabarit(sujet, corps) });
      return { ...resultat, channel: 'email' };
    } catch {
      return { sent: false, reason: 'error' };
    }
  }

  console.log(`[notif équipe stub] ${sujet}`);
  return { sent: false, reason: 'no_channel' };
}

// Code de connexion par E-MAIL — le remède aux SMS qui n'arrivent pas à
// l'étranger (itinérance coupée) : le Wi-Fi, lui, marche toujours.
export function emailCodeOtp(code) {
  const corps = `
    <p style="margin:0 0 10px;font-size:15px;line-height:22px;">
      Voici votre code de connexion zanziGo · Here is your zanziGo login code:
    </p>
    <p style="margin:0;text-align:center;">
      <span style="display:inline-block;background:#FBF0E4;border-radius:14px;padding:14px 30px;font-size:34px;font-weight:800;letter-spacing:8px;color:#E4572E;">${code}</span>
    </p>
    <p style="margin:14px 0 0;font-size:13px;color:#8A7168;">
      Valable 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.<br>
      Valid for 10 minutes. If you didn't request it, just ignore this e-mail.
    </p>`;
  return {
    subject: `${code} — votre code zanziGo · your zanziGo code`,
    html: gabarit('Votre code de connexion · Your login code', corps),
  };
}

const LIBELLES_PROFIL = {
  tourist: 'Touriste · prix en USD',
  resident: 'Résident · prix en USD (−10 % une fois vérifié)',
  local: 'Local · prix en shillings (TZS)',
};

// Récapitulatif d'inscription CLIENT (touriste, résident ou local).
export function emailBienvenueClient(user) {
  const profil = LIBELLES_PROFIL[user.account_type] ?? user.account_type;
  const enAttente = user.verification_status !== 'verified';
  const corps = `
    <p style="margin:0 0 16px;font-size:15px;line-height:22px;">
      Bonjour <strong>${user.full_name}</strong>, votre compte zanziGo est créé.
      Voici le récapitulatif de votre inscription.<br>
      <span style="color:#8A7168;font-size:13px;">Hello ${user.full_name}, your zanziGo account has been created — here is your registration summary.</span>
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF0E4;border-radius:12px;padding:8px 16px;">
      ${ligne('Nom / Name', user.full_name)}
      ${ligne('Téléphone / Phone', user.phone)}
      ${ligne('Profil / Profile', profil)}
      ${enAttente ? ligne('Statut / Status', 'Document en cours de vérification par l’équipe') : ''}
    </table>
    <p style="margin:16px 0 0;font-size:14px;line-height:21px;">
      Avec zanziGo vous pouvez réserver un <strong>taxi privé</strong>, une place en
      <strong>taxi partagé</strong> et envoyer des <strong>colis</strong> partout sur l'île.
      Connexion par votre numéro de téléphone (code SMS) — rien à retenir.
    </p>
    ${bouton(URL_APP, 'Ouvrir zanziGo / Open zanziGo')}`;
  return {
    subject: 'Bienvenue sur zanziGo 🌴 — récapitulatif de votre inscription',
    html: gabarit('Karibu ! Bienvenue sur zanziGo', corps),
  };
}

// Récapitulatif d'inscription HÔTEL PARTENAIRE + identifiants de connexion.
// Sécurité : le mot de passe n'est JAMAIS renvoyé par e-mail — on rappelle
// l'e-mail de connexion et où se connecter, c'est tout.
export function emailBienvenueHotel(hotel) {
  const corps = `
    <p style="margin:0 0 16px;font-size:15px;line-height:22px;">
      Bonjour <strong>${hotel.contact_name}</strong>, le compte partenaire de
      <strong>${hotel.name}</strong> est créé. Voici votre récapitulatif et vos
      informations de connexion.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF0E4;border-radius:12px;padding:8px 16px;">
      ${ligne('Établissement', hotel.name)}
      ${ligne('Contact', hotel.contact_name)}
      ${ligne('Zone', hotel.zone)}
      ${ligne('WhatsApp', hotel.phone)}
    </table>
    <h2 style="margin:20px 0 8px;font-size:16px;color:#33222B;">🔑 Vos identifiants de connexion</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF0E4;border-radius:12px;padding:8px 16px;">
      ${ligne('E-mail de connexion', hotel.email)}
      ${ligne('Mot de passe', 'celui choisi à l’inscription')}
      ${ligne('Où se connecter', 'zanzigo-api.onrender.com/web')}
    </table>
    <p style="margin:12px 0 0;font-size:13px;color:#8A7168;">
      Par sécurité, votre mot de passe n'est jamais envoyé par e-mail.
      La connexion marche depuis un ordinateur comme depuis un téléphone :
      choisissez « Hôtel partenaire » puis entrez votre e-mail et votre mot de passe.
    </p>
    ${bouton(URL_WEB, 'Ouvrir zanziGo sur mon ordinateur')}
    <p style="margin:8px 0 0;font-size:14px;line-height:21px;">
      <strong>Votre compte sera activé après vérification par notre équipe</strong>
      (nous vous contactons rapidement). Ensuite, profitez de la
      <strong>remise partenaire −5 %</strong>, du <strong>compte crédit prépayé</strong>
      et de la <strong>carte de fidélité</strong> : toutes les 20 courses terminées,
      un bon à dépenser (10 $ de crédit ou un envoi de colis offert).
    </p>`;
  return {
    subject: 'Votre compte partenaire zanziGo 🏨 — récapitulatif et connexion',
    html: gabarit(`Bienvenue, ${hotel.name} !`, corps),
  };
}
