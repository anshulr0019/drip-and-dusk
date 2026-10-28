ALTER TABLE products ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'razorpay';
ALTER TABLE orders ADD COLUMN payment_reference TEXT;
CREATE TABLE store_settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE owner_audit(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),action TEXT NOT NULL,actor TEXT NOT NULL,reference TEXT,at INTEGER NOT NULL);
DROP TRIGGER release_stock;
CREATE TRIGGER release_stock AFTER UPDATE OF status ON orders
WHEN OLD.status IN('pending','awaiting_verification') AND NEW.status IN('expired','cancelled') AND OLD.payment_status='pending' BEGIN
 UPDATE products SET revision=revision+1,held=held-(SELECT qty FROM order_lines WHERE order_id=NEW.id AND product_id=products.id)
 WHERE id IN(SELECT product_id FROM order_lines WHERE order_id=NEW.id);
END;

DROP TRIGGER capture_stock;
CREATE TRIGGER capture_stock AFTER UPDATE OF payment_status ON orders WHEN OLD.payment_status='pending' AND NEW.payment_status='captured' BEGIN
 UPDATE products SET revision=revision+1,quantity=quantity-(SELECT qty FROM order_lines WHERE order_id=NEW.id AND product_id=products.id),
 held=held-(SELECT qty FROM order_lines WHERE order_id=NEW.id AND product_id=products.id)
 WHERE id IN(SELECT product_id FROM order_lines WHERE order_id=NEW.id);
END;
DROP TRIGGER reserve_stock;
CREATE TRIGGER reserve_stock BEFORE INSERT ON order_lines BEGIN
 UPDATE products SET revision=revision+1,held=held+NEW.qty WHERE id=NEW.product_id AND enabled=1 AND quantity-held>=NEW.qty AND price_paise=NEW.unit_paise;
 SELECT CASE WHEN changes()=0 THEN RAISE(ABORT,'stock_changed') END;
END;

-- Seed the explicitly labelled sample shortlist without overriding an owner selection.
UPDATE products SET data=json_set(data,'$.hotSeller',json('true')),revision=revision+1
WHERE id IN('hawas-bottle','khamrah-bottle','qahwa-bottle','yara-bottle') AND json_extract(data,'$.hotSeller') IS NULL;
