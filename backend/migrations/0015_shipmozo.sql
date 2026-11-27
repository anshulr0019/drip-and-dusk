-- Additive only. Shipmozo booking state per order; existing orders keep empty defaults and the manual shipment form keeps working.
-- shipmozo_order_id is set once the order is pushed, shipmozo_courier_id once a courier is assigned, shipment_id (existing) once an AWB exists.
ALTER TABLE orders ADD COLUMN shipment_provider TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN shipmozo_order_id TEXT;
ALTER TABLE orders ADD COLUMN shipmozo_warehouse_id TEXT;
ALTER TABLE orders ADD COLUMN shipmozo_courier_id TEXT;
ALTER TABLE orders ADD COLUMN shipment_status TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN expected_delivery TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN shipment_checked_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN shipment_attempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN shipment_lease_until INTEGER NOT NULL DEFAULT 0;
CREATE INDEX orders_shipmozo_sync ON orders(shipment_provider,shipment_checked_at);
