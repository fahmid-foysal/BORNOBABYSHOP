ALTER TABLE offline_sales ADD COLUMN return_status VARCHAR(20) NOT NULL DEFAULT 'none';
ALTER TABLE online_sales ADD COLUMN return_status VARCHAR(20) NOT NULL DEFAULT 'none';

ALTER TABLE offline_sale_products ADD COLUMN returned_quantity DECIMAL(15,3) NOT NULL DEFAULT 0;
ALTER TABLE offline_sale_combos ADD COLUMN returned_quantity DECIMAL(15,3) NOT NULL DEFAULT 0;
ALTER TABLE online_sale_products ADD COLUMN returned_quantity DECIMAL(15,3) NOT NULL DEFAULT 0;
ALTER TABLE online_sale_combos ADD COLUMN returned_quantity DECIMAL(15,3) NOT NULL DEFAULT 0;

UPDATE offline_sales SET return_status='full' WHERE status='returned';
UPDATE online_sales SET return_status='full' WHERE status='returned';
UPDATE offline_sale_products p JOIN offline_sales s ON s.id=p.offline_sale_id SET p.returned_quantity=p.quantity WHERE s.status='returned';
UPDATE offline_sale_combos c JOIN offline_sales s ON s.id=c.offline_sale_id SET c.returned_quantity=c.quantity WHERE s.status='returned';
UPDATE online_sale_products p JOIN online_sales s ON s.id=p.online_sale_id SET p.returned_quantity=p.quantity WHERE s.status='returned';
UPDATE online_sale_combos c JOIN online_sales s ON s.id=c.online_sale_id SET c.returned_quantity=c.quantity WHERE s.status='returned';

ALTER TABLE sale_components ADD COLUMN returned_quantity DECIMAL(15,3) NOT NULL DEFAULT 0 AFTER quantity;
UPDATE sale_components SET returned_quantity=quantity WHERE active=0;

CREATE TABLE sale_line_components (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 channel ENUM('offline','online') NOT NULL,
 sale_id BIGINT UNSIGNED NOT NULL,
 item_type ENUM('product','combo') NOT NULL,
 sale_line_id BIGINT UNSIGNED NOT NULL,
 product_id BIGINT UNSIGNED NOT NULL,
 component_quantity DECIMAL(15,3) NOT NULL,
 UNIQUE KEY uq_sale_line_component (channel,item_type,sale_line_id,product_id),
 INDEX idx_sale_line_component_sale (channel,sale_id),
 FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

INSERT INTO sale_line_components(channel,sale_id,item_type,sale_line_id,product_id,component_quantity)
 SELECT 'offline',offline_sale_id,'product',id,product_id,1 FROM offline_sale_products
 UNION ALL SELECT 'online',online_sale_id,'product',id,product_id,1 FROM online_sale_products
 UNION ALL SELECT 'offline',s.offline_sale_id,'combo',s.id,ci.product_id,ci.quantity FROM offline_sale_combos s JOIN product_combo_items ci ON ci.product_combo_id=s.product_combo_id
 UNION ALL SELECT 'online',s.online_sale_id,'combo',s.id,ci.product_id,ci.quantity FROM online_sale_combos s JOIN product_combo_items ci ON ci.product_combo_id=s.product_combo_id;

CREATE TABLE sale_returns (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 channel ENUM('offline','online') NOT NULL,
 sale_id BIGINT UNSIGNED NOT NULL,
 returned_gross DECIMAL(15,2) NOT NULL,
 allocated_discount DECIMAL(15,2) NOT NULL DEFAULT 0,
 delivery_refund DECIMAL(15,2) NOT NULL DEFAULT 0,
 refund_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
 payment_method_id BIGINT UNSIGNED NULL,
 notes TEXT,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_by BIGINT UNSIGNED NOT NULL,
 INDEX idx_sale_return_sale (channel,sale_id),
 FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE RESTRICT,
 FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE sale_return_items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 sale_return_id BIGINT UNSIGNED NOT NULL,
 item_type ENUM('product','combo') NOT NULL,
 sale_line_id BIGINT UNSIGNED NOT NULL,
 item_id BIGINT UNSIGNED NOT NULL,
 quantity DECIMAL(15,3) NOT NULL,
 rate DECIMAL(15,2) NOT NULL,
 gross_amount DECIMAL(15,2) NOT NULL,
 discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
 INDEX idx_return_item_line (item_type,sale_line_id),
 FOREIGN KEY (sale_return_id) REFERENCES sale_returns(id) ON DELETE CASCADE
) ENGINE=InnoDB;

DROP VIEW product_stock;
CREATE VIEW product_stock AS
 SELECT p.id product_id,
 COALESCE((SELECT SUM(pi.quantity) FROM purchase_items pi JOIN purchases pu ON pu.id=pi.purchase_id WHERE pi.product_id=p.id AND pu.status='active'),0)
 + COALESCE((SELECT SUM(sa.quantity) FROM stock_adjustments sa WHERE sa.product_id=p.id),0)
 - COALESCE((SELECT SUM(CASE WHEN sc.active=1 THEN GREATEST(sc.quantity-sc.returned_quantity,0) ELSE 0 END) FROM sale_components sc WHERE sc.product_id=p.id),0) stock
 FROM products p;

DROP VIEW sale_lines;
CREATE VIEW sale_lines AS
 SELECT 'offline' channel,s.offline_sale_id sale_id,'product' item_type,s.id line_id,s.product_id item_id,p.product_name item_name,s.quantity sold_quantity,s.returned_quantity,GREATEST(s.quantity-s.returned_quantity,0) quantity,s.rate FROM offline_sale_products s JOIN products p ON p.id=s.product_id
 UNION ALL SELECT 'offline',s.offline_sale_id,'combo',s.id,s.product_combo_id,c.combo_name,s.quantity,s.returned_quantity,GREATEST(s.quantity-s.returned_quantity,0),s.rate FROM offline_sale_combos s JOIN product_combos c ON c.id=s.product_combo_id
 UNION ALL SELECT 'online',s.online_sale_id,'product',s.id,s.product_id,p.product_name,s.quantity,s.returned_quantity,GREATEST(s.quantity-s.returned_quantity,0),s.rate FROM online_sale_products s JOIN products p ON p.id=s.product_id
 UNION ALL SELECT 'online',s.online_sale_id,'combo',s.id,s.product_combo_id,c.combo_name,s.quantity,s.returned_quantity,GREATEST(s.quantity-s.returned_quantity,0),s.rate FROM online_sale_combos s JOIN product_combos c ON c.id=s.product_combo_id;
