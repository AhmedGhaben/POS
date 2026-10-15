-- Businesses in Angola trade in kwanzas: ISO 4217 "AOA" (printed "Kz").
-- New ones get it from the country config at sign-up; existing ones are
-- fixed here (they were created with the old USD default).
UPDATE "businesses" SET "currency" = 'AOA' WHERE "country" = 'AO' AND "currency" <> 'AOA';
