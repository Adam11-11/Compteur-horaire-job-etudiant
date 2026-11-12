-- =====================================================================
-- COMPTEUR PAELLA — SCRIPT DE MIGRATION & RÉPARATION SUPABASE
-- =====================================================================
-- À copier-coller et exécuter dans l'onglet "SQL Editor" de votre tableau
-- de bord Supabase (https://supabase.com/dashboard/project/pvfdcgphreklscoexyip/sql)
-- =====================================================================

-- 1. AJOUT DES COLONNES MANQUANTES POUR LES PHOTOS DANS LA TABLE 'shifts'
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS proof_path text;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS has_proof boolean DEFAULT false;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS proof_url text;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_legacy boolean DEFAULT false;

-- 2. CRÉATION DU BUCKET STORAGE 'proofs' (S'IL N'EXISTE PAS ENCORE)
INSERT INTO storage.buckets (id, name, public)
VALUES ('proofs', 'proofs', false)
ON CONFLICT (id) DO NOTHING;

-- 3. POLITIQUES DE SÉCURITÉ POUR PERMETTRE L'UPLOAD ET LA LECTURE DES PHOTOS
-- (Permet l'accès avec la clé publique anon de l'application)

-- Permettre l'envoi d'images dans le bucket 'proofs'
DROP POLICY IF EXISTS "Autoriser upload photos" ON storage.objects;
CREATE POLICY "Autoriser upload photos"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'proofs');

-- Permettre la lecture / téléchargement des photos
DROP POLICY IF EXISTS "Autoriser lecture photos" ON storage.objects;
CREATE POLICY "Autoriser lecture photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'proofs');

-- Permettre la suppression / remplacement des photos
DROP POLICY IF EXISTS "Autoriser suppression photos" ON storage.objects;
CREATE POLICY "Autoriser suppression photos"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'proofs');

DROP POLICY IF EXISTS "Autoriser mise a jour photos" ON storage.objects;
CREATE POLICY "Autoriser mise a jour photos"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'proofs');

-- 4. ACTIVATION DU TEMPS RÉEL (SUPABASE REALTIME) SUR LA TABLE 'shifts'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'shifts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE shifts;
  END IF;
END $$;


