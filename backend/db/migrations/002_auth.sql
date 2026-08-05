-- Migration 002 : authentification par OTP SMS
-- Les codes ne sont JAMAIS stockés en clair : uniquement leur hash sha256.

CREATE TABLE otp_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        text NOT NULL,
  code_hash    text NOT NULL,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX otp_codes_phone_idx ON otp_codes (phone);
