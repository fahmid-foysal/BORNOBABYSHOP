ALTER TABLE online_sales ADD UNIQUE KEY uq_steadfast_consignment (steadfast_consignment_id),
 ADD INDEX idx_online_sales_created (created_at);
ALTER TABLE offline_sales ADD INDEX idx_offline_sales_created (created_at);
ALTER TABLE online_sale_payments ADD INDEX idx_online_payments_created (created_at);
ALTER TABLE offline_sale_payments ADD INDEX idx_offline_payments_created (created_at);
ALTER TABLE purchase_payouts ADD INDEX idx_purchase_payouts_created (created_at);
ALTER TABLE expenses ADD INDEX idx_expenses_created (created_at);
ALTER TABLE incomes ADD INDEX idx_incomes_created (created_at);
