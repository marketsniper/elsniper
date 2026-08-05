// Envoi de SMS (codes OTP).
// Stub MVP : le code est loggé en console. Structure pluggable :
// en production, brancher Twilio ou Africa's Talking ici (une seule
// fonction à réimplémenter, aucune autre partie du code à toucher).

export async function sendOtp(phone, code) {
  // TODO prod : remplacer par un appel Twilio / Africa's Talking, ex. :
  //   await twilioClient.messages.create({ to: phone, body: `Code zanziGo : ${code}` })
  console.log(`[SMS stub] Code zanziGo pour ${phone}: ${code}`);
}
