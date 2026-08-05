import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://zanzigo:zanzigo@localhost:5432/zanzigo',
  // Numéro WhatsApp Business de l'équipe zanziGo (format international sans "+").
  teamWhatsappNumber: process.env.TEAM_WHATSAPP_NUMBER || '255000000000',
  // Part de commission zanziGo appliquée sur chaque course/colis.
  commissionRate: Number(process.env.COMMISSION_RATE || 0.15),
};
