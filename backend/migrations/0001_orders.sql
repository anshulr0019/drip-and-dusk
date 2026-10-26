PRAGMA foreign_keys = ON;
CREATE TABLE products (
 id TEXT PRIMARY KEY, data TEXT NOT NULL, price_paise INTEGER NOT NULL CHECK(price_paise>=0),
 quantity INTEGER NOT NULL CHECK(quantity>=0), held INTEGER NOT NULL DEFAULT 0 CHECK(held>=0 AND held<=quantity), enabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE quotes (id TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE orders (
 id TEXT PRIMARY KEY, ref TEXT NOT NULL UNIQUE, request_id TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 quote_id TEXT NOT NULL UNIQUE REFERENCES quotes(id), customer TEXT NOT NULL, consent INTEGER NOT NULL DEFAULT 0,
 lines TEXT NOT NULL, subtotal_paise INTEGER NOT NULL, shipping_paise INTEGER NOT NULL, total_paise INTEGER NOT NULL,
 delivery_label TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', payment_status TEXT NOT NULL DEFAULT 'pending',
 gateway_order_id TEXT UNIQUE, payment_id TEXT UNIQUE, shipment_id TEXT UNIQUE,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX orders_pending ON orders(status,expires_at);
CREATE TABLE order_lines (
 order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id), qty INTEGER NOT NULL CHECK(qty BETWEEN 1 AND 20),
 unit_paise INTEGER NOT NULL CHECK(unit_paise>0), PRIMARY KEY(order_id,product_id)
);
CREATE TRIGGER reserve_stock BEFORE INSERT ON order_lines BEGIN
 UPDATE products SET held=held+NEW.qty WHERE id=NEW.product_id AND enabled=1 AND quantity-held>=NEW.qty AND price_paise=NEW.unit_paise;
 SELECT CASE WHEN changes()=0 THEN RAISE(ABORT,'stock_changed') END;
END;
CREATE TRIGGER capture_stock AFTER UPDATE OF payment_status ON orders WHEN OLD.payment_status='pending' AND NEW.payment_status='captured' BEGIN
 UPDATE products SET quantity=quantity-(SELECT qty FROM order_lines WHERE order_id=NEW.id AND product_id=products.id),
 held=held-(SELECT qty FROM order_lines WHERE order_id=NEW.id AND product_id=products.id)
 WHERE id IN(SELECT product_id FROM order_lines WHERE order_id=NEW.id);
END;
CREATE TRIGGER release_stock AFTER UPDATE OF status ON orders WHEN OLD.status='pending' AND NEW.status IN('expired','cancelled') AND OLD.payment_status='pending' BEGIN
 UPDATE products SET held=held-(SELECT qty FROM order_lines WHERE order_id=NEW.id AND product_id=products.id)
 WHERE id IN(SELECT product_id FROM order_lines WHERE order_id=NEW.id);
END;
CREATE TABLE order_events(order_id TEXT NOT NULL REFERENCES orders(id), status TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(order_id,status));
CREATE TABLE notifications (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
 message_id TEXT UNIQUE, last_error TEXT, UNIQUE(order_id,kind)
);
CREATE TABLE webhook_receipts(provider TEXT NOT NULL,event_id TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(provider,event_id));
CREATE TABLE rate_limits(key TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL);
