ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0;
CREATE TABLE erp_write_lock (id INT PRIMARY KEY) ENGINE=InnoDB;
INSERT INTO erp_write_lock VALUES(1);
ALTER TABLE product_combo_items ADD COLUMN quantity DECIMAL(15,3) NOT NULL DEFAULT 1;
ALTER TABLE customers ADD UNIQUE KEY uq_customer_phone (cus_phone);
ALTER TABLE steadfast_payments ADD UNIQUE KEY uq_settlement (steadfast_payment_id);
ALTER TABLE online_sales ADD COLUMN steadfast_submitted_at DATETIME NULL,
 ADD COLUMN steadfast_last_error TEXT NULL, ADD COLUMN steadfast_webhook_at DATETIME NULL;

CREATE TABLE barcode_registry (
 barcode CHAR(5) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 entity_type ENUM('product','combo') NOT NULL,
 entity_id BIGINT UNSIGNED NULL,
 UNIQUE KEY uq_barcode_entity (entity_type,entity_id)
) ENGINE=InnoDB;
INSERT INTO barcode_registry SELECT barcode,'product',id FROM products WHERE barcode IS NOT NULL;
INSERT INTO barcode_registry SELECT barcode,'combo',id FROM product_combos WHERE barcode IS NOT NULL;

CREATE TABLE sale_components (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 channel ENUM('offline','online') NOT NULL,
 sale_id BIGINT UNSIGNED NOT NULL,
 product_id BIGINT UNSIGNED NOT NULL,
 quantity DECIMAL(15,3) NOT NULL,
 cost_rate DECIMAL(15,2) NOT NULL DEFAULT 0,
 category_id BIGINT UNSIGNED NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 INDEX idx_component_sale(channel,sale_id),
 FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

INSERT INTO sale_components(channel,sale_id,product_id,quantity,cost_rate,category_id,active)
 SELECT 'offline',sp.offline_sale_id,sp.product_id,sp.quantity,p.purchase_price,p.category_id,s.status<>'returned' FROM offline_sale_products sp JOIN products p ON p.id=sp.product_id JOIN offline_sales s ON s.id=sp.offline_sale_id
 UNION ALL SELECT 'online',sp.online_sale_id,sp.product_id,sp.quantity,p.purchase_price,p.category_id,s.status<>'returned' FROM online_sale_products sp JOIN products p ON p.id=sp.product_id JOIN online_sales s ON s.id=sp.online_sale_id
 UNION ALL SELECT 'offline',sc.offline_sale_id,ci.product_id,sc.quantity*ci.quantity,p.purchase_price,p.category_id,s.status<>'returned' FROM offline_sale_combos sc JOIN product_combo_items ci ON ci.product_combo_id=sc.product_combo_id JOIN products p ON p.id=ci.product_id JOIN offline_sales s ON s.id=sc.offline_sale_id
 UNION ALL SELECT 'online',sc.online_sale_id,ci.product_id,sc.quantity*ci.quantity,p.purchase_price,p.category_id,s.status<>'returned' FROM online_sale_combos sc JOIN product_combo_items ci ON ci.product_combo_id=sc.product_combo_id JOIN products p ON p.id=ci.product_id JOIN online_sales s ON s.id=sc.online_sale_id;

CREATE VIEW product_stock AS
 SELECT p.id product_id,
 COALESCE((SELECT SUM(pi.quantity) FROM purchase_items pi JOIN purchases pu ON pu.id=pi.purchase_id WHERE pi.product_id=p.id AND pu.status='active'),0)
 + COALESCE((SELECT SUM(sa.quantity) FROM stock_adjustments sa WHERE sa.product_id=p.id),0)
 - COALESCE((SELECT SUM(sc.quantity) FROM sale_components sc WHERE sc.product_id=p.id AND sc.active=1),0) stock
 FROM products p;

CREATE VIEW sale_lines AS
 SELECT 'offline' channel,s.offline_sale_id sale_id,'product' item_type,s.product_id item_id,p.product_name item_name,s.quantity,s.rate FROM offline_sale_products s JOIN products p ON p.id=s.product_id
 UNION ALL SELECT 'offline',s.offline_sale_id,'combo',s.product_combo_id,c.combo_name,s.quantity,s.rate FROM offline_sale_combos s JOIN product_combos c ON c.id=s.product_combo_id
 UNION ALL SELECT 'online',s.online_sale_id,'product',s.product_id,p.product_name,s.quantity,s.rate FROM online_sale_products s JOIN products p ON p.id=s.product_id
 UNION ALL SELECT 'online',s.online_sale_id,'combo',s.product_combo_id,c.combo_name,s.quantity,s.rate FROM online_sale_combos s JOIN product_combos c ON c.id=s.product_combo_id;

CREATE VIEW all_sales AS
 SELECT 'offline' channel,id,customer_id,status,notes,sales_employee_id,final_discount,0 delivery_charge,created_at,created_by FROM offline_sales
 UNION ALL SELECT 'online',id,customer_id,status,notes,sales_employee_id,final_discount,delivery_charge,created_at,created_by FROM online_sales;

CREATE TABLE settlement_allocations (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 steadfast_payment_id VARCHAR(150) NOT NULL,
 consignment_id BIGINT NOT NULL,
 online_sale_id BIGINT UNSIGNED NOT NULL,
 amount DECIMAL(15,2) NOT NULL,
 UNIQUE KEY uq_settlement_allocation(steadfast_payment_id,consignment_id),
 FOREIGN KEY(online_sale_id) REFERENCES online_sales(id)
) ENGINE=InnoDB;
