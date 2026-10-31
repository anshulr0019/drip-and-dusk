-- Additive only. Existing rows keep working: tracking_version 1 matches the original link format, and the hash columns stay NULL for orders that were never counted against the open-order caps.
ALTER TABLE orders ADD COLUMN tracking_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN phone_hash TEXT;
ALTER TABLE orders ADD COLUMN visitor_hash TEXT;
ALTER TABLE orders ADD COLUMN client_ip_hash TEXT;
ALTER TABLE orders ADD COLUMN received_paise INTEGER;
ALTER TABLE orders ADD COLUMN anonymised_at INTEGER;
CREATE INDEX orders_open_phone ON orders(phone_hash,status);
CREATE INDEX orders_open_visitor ON orders(visitor_hash,status);
CREATE INDEX orders_open_ip ON orders(client_ip_hash,status);
