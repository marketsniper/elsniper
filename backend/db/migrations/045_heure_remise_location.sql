-- L'HEURE DE DÉBUT choisie par le client (demande du 31/08/2026 : « le
-- client doit pouvoir mettre l'heure à laquelle il souhaite démarrer la
-- location »). « HH:MM », optionnelle — sans heure, la remise se convient
-- par WhatsApp comme avant.
ALTER TABLE rental_bookings ADD COLUMN IF NOT EXISTS pickup_time TEXT;
