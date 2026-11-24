ALTER TABLE online_sales
  ADD COLUMN steadfast_lot INT UNSIGNED NOT NULL DEFAULT 1 AFTER delivery_charge,
  ADD COLUMN orderer_whatsapp VARCHAR(30) NULL AFTER orderer_num,
  ADD CONSTRAINT chk_online_sales_steadfast_lot CHECK (steadfast_lot >= 1);
