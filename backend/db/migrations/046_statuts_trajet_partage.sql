-- Migration 046 : le taxi partagé apprend à ROULER.
--
-- Une annonce ne connaissait que trois états : ouverte, close, annulée. Le
-- chauffeur n'avait donc aucun moyen de dire « je pars » ni « tout le monde
-- est arrivé », et l'équipe ne voyait jamais quelles voitures étaient sur la
-- route. Deux états de plus : en route, terminé.
--
-- Ajout des valeurs d'ENUM seul : PostgreSQL interdit d'utiliser une nouvelle
-- valeur d'enum dans la transaction qui l'a créée — les colonnes qui vont
-- avec arrivent en migration 047 (même découpage que 006/007).

ALTER TYPE ride_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE ride_status ADD VALUE IF NOT EXISTS 'completed';
