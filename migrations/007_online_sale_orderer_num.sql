ALTER TABLE online_sales
  ADD COLUMN orderer_num VARCHAR(100) NULL AFTER customer_id,
  ADD INDEX idx_online_sales_orderer_num (orderer_num);
