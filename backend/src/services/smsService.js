// Envoi de SMS (codes OTP). Deux modes :
//  - RÉEL : Africa's Talking (couvre la Tanzanie — M-Pesa des SMS) dès que
//    AT_USERNAME et AT_API_KEY sont posés — le client reçoit VRAIMENT son
//    code par SMS sur son téléphone ;
//  - STUB : sans clés, le code est journalisé, et l'app l'affiche à l'écran
//    (mode pilote OTP_EXPOSE_DEV_CODE).
// Un SMS qui échoue ne bloque JAMAIS la demande de code : le mode pilote
// reste la roue de secours tant que l'opérateur n'est pas fiable.
import { config } from '../config.js';

export function isSmsStub() {
  return !config.sms.username || !config.sms.apiKey;
}

export async function sendOtp(phone, code) {
  if (isSmsStub()) {
    console.log(`[SMS stub] Code zanziGo pour ${phone}: ${code}`);
    return { sent: false, stub: true };
  }
  try {
    const corps = new URLSearchParams({
      username: config.sms.username,
      to: phone,
      message: `Code zanziGo: ${code}\nKaribu Zanzibar!`,
    });
    // Identité d'expéditeur (ex. « zanziGo ») — optionnelle, à faire
    // approuver par Africa's Talking avant usage.
    if (config.sms.senderId) corps.set('from', config.sms.senderId);
    const reponse = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        apiKey: config.sms.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: corps.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const donnees = await reponse.json().catch(() => null);
    const statut = donnees?.SMSMessageData?.Recipients?.[0]?.status ?? '';
    if (reponse.ok && /success/i.test(statut)) {
      console.log(`[SMS] Code envoyé à ${phone} (Africa's Talking)`);
      return { sent: true };
    }
    console.error(`[SMS] échec Africa's Talking pour ${phone} (${reponse.status}: ${statut || 'sans statut'})`);
    return { sent: false, reason: statut || `status_${reponse.status}` };
  } catch (err) {
    console.error(`[SMS] Africa's Talking injoignable pour ${phone}: ${err.message}`);
    return { sent: false, reason: 'network' };
  }
}
