-- Información del negocio para el bot de WhatsApp (editable por admin). Fila única id = 1.
ALTER TABLE store_settings
  ADD COLUMN business_hours TEXT,
  ADD COLUMN delivery_days TEXT[],
  ADD COLUMN delivery_zones TEXT[],
  ADD COLUMN minimum_order NUMERIC(12,2),
  ADD COLUMN free_shipping_from NUMERIC(12,2),
  ADD COLUMN payment_methods TEXT[],
  ADD COLUMN transfer_alias VARCHAR(40),
  ADD COLUMN transfer_cbu VARCHAR(22),
  ADD COLUMN transfer_holder VARCHAR(100),
  ADD COLUMN transfer_bank VARCHAR(60),
  ADD COLUMN pickup_address TEXT,
  ADD COLUMN price_list_url VARCHAR(500),
  ADD COLUMN contact_phone VARCHAR(30),
  ADD COLUMN contact_email VARCHAR(255),
  ADD COLUMN additional_info TEXT;

ALTER TABLE store_settings
  ADD CONSTRAINT store_settings_delivery_days_valid
    CHECK (delivery_days <@ ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']::TEXT[]),
  ADD CONSTRAINT store_settings_payment_methods_valid
    CHECK (payment_methods <@ ARRAY['mercadopago','transfer','cash_on_delivery','cash_pickup']::TEXT[]),
  ADD CONSTRAINT store_settings_transfer_cbu_format
    CHECK (transfer_cbu ~ '^\d{22}$');

-- Rollback:
-- ALTER TABLE store_settings
--   DROP CONSTRAINT IF EXISTS store_settings_transfer_cbu_format,
--   DROP CONSTRAINT IF EXISTS store_settings_payment_methods_valid,
--   DROP CONSTRAINT IF EXISTS store_settings_delivery_days_valid;
-- ALTER TABLE store_settings
--   DROP COLUMN IF EXISTS additional_info, DROP COLUMN IF EXISTS contact_email,
--   DROP COLUMN IF EXISTS contact_phone, DROP COLUMN IF EXISTS price_list_url,
--   DROP COLUMN IF EXISTS pickup_address, DROP COLUMN IF EXISTS transfer_bank,
--   DROP COLUMN IF EXISTS transfer_holder, DROP COLUMN IF EXISTS transfer_cbu,
--   DROP COLUMN IF EXISTS transfer_alias, DROP COLUMN IF EXISTS payment_methods,
--   DROP COLUMN IF EXISTS free_shipping_from, DROP COLUMN IF EXISTS minimum_order,
--   DROP COLUMN IF EXISTS delivery_zones, DROP COLUMN IF EXISTS delivery_days,
--   DROP COLUMN IF EXISTS business_hours;
