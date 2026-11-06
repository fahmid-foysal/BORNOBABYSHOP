CREATE TEMPORARY TABLE payment_method_merge AS
 SELECT MIN(id) keep_id,UPPER(TRIM(method)) normalized_name
 FROM payment_methods GROUP BY UPPER(TRIM(method));

UPDATE purchase_payouts p JOIN payment_methods m ON m.id=p.payment_method_id JOIN payment_method_merge x ON x.normalized_name=UPPER(TRIM(m.method)) SET p.payment_method_id=x.keep_id;
UPDATE offline_sale_payments p JOIN payment_methods m ON m.id=p.payment_method_id JOIN payment_method_merge x ON x.normalized_name=UPPER(TRIM(m.method)) SET p.payment_method_id=x.keep_id;
UPDATE online_sale_payments p JOIN payment_methods m ON m.id=p.payment_method_id JOIN payment_method_merge x ON x.normalized_name=UPPER(TRIM(m.method)) SET p.payment_method_id=x.keep_id;
UPDATE sale_returns r JOIN payment_methods m ON m.id=r.payment_method_id JOIN payment_method_merge x ON x.normalized_name=UPPER(TRIM(m.method)) SET r.payment_method_id=x.keep_id;
DELETE m FROM payment_methods m JOIN payment_method_merge x ON x.normalized_name=UPPER(TRIM(m.method)) WHERE m.id<>x.keep_id;
UPDATE payment_methods SET method=UPPER(TRIM(method));
DROP TEMPORARY TABLE payment_method_merge;

CREATE TEMPORARY TABLE employee_merge AS
 SELECT MIN(id) keep_id,UPPER(TRIM(name)) normalized_name
 FROM employees GROUP BY UPPER(TRIM(name));

UPDATE offline_sales s JOIN employees e ON e.id=s.sales_employee_id JOIN employee_merge x ON x.normalized_name=UPPER(TRIM(e.name)) SET s.sales_employee_id=x.keep_id;
UPDATE online_sales s JOIN employees e ON e.id=s.sales_employee_id JOIN employee_merge x ON x.normalized_name=UPPER(TRIM(e.name)) SET s.sales_employee_id=x.keep_id;
DELETE e FROM employees e JOIN employee_merge x ON x.normalized_name=UPPER(TRIM(e.name)) WHERE e.id<>x.keep_id;
UPDATE employees SET name=UPPER(TRIM(name));
DROP TEMPORARY TABLE employee_merge;

ALTER TABLE payment_methods MODIFY method VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
SET @payment_method_index_sql=(SELECT IF(
 EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='payment_methods' AND index_name='uq_payment_method_name'),
 'SELECT 1',
 'ALTER TABLE payment_methods ADD UNIQUE KEY uq_payment_method_name (method)'
));
PREPARE payment_method_index_statement FROM @payment_method_index_sql;
EXECUTE payment_method_index_statement;
DEALLOCATE PREPARE payment_method_index_statement;

ALTER TABLE employees MODIFY name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
SET @employee_index_sql=(SELECT IF(
 EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='employees' AND index_name='uq_employee_name'),
 'SELECT 1',
 'ALTER TABLE employees ADD UNIQUE KEY uq_employee_name (name)'
));
PREPARE employee_index_statement FROM @employee_index_sql;
EXECUTE employee_index_statement;
DEALLOCATE PREPARE employee_index_statement;
