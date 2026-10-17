-- "Idioma dos documentos" per store; null = the store's country's language (AO → pt-AO).
ALTER TABLE "stores" ADD COLUMN "documentLanguage" TEXT;
