-- Add onboarding_completed column to profiles
-- Tracks whether a parent has completed first-login onboarding
-- (child confirmation + notification permission priming)

ALTER TABLE profiles ADD COLUMN onboarding_completed boolean DEFAULT false;
