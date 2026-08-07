-- Migration 006 : troisième type de compte — « local » (Tanzanien muni
-- de sa carte d'identité). Ajout de la valeur d'ENUM seul : PostgreSQL
-- interdit d'utiliser une nouvelle valeur d'enum dans la même transaction,
-- les règles associées arrivent en migration 007.

ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'local';
