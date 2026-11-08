DROP VIEW IF EXISTS sale_lines;
CREATE VIEW sale_lines AS
 SELECT CAST('offline' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci channel,s.offline_sale_id sale_id,CAST('product' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci item_type,s.id line_id,s.product_id item_id,p.product_name item_name,s.quantity sold_quantity,s.returned_quantity,GREATEST(s.quantity-s.returned_quantity,0) quantity,s.rate FROM offline_sale_products s JOIN products p ON p.id=s.product_id
 UNION ALL SELECT CAST('offline' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci,s.offline_sale_id,CAST('combo' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci,s.id,s.product_combo_id,c.combo_name,s.quantity,s.returned_quantity,GREATEST(s.quantity-s.returned_quantity,0),s.rate FROM offline_sale_combos s JOIN product_combos c ON c.id=s.product_combo_id
 UNION ALL SELECT CAST('online' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci,s.online_sale_id,CAST('product' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci,s.id,s.product_id,p.product_name,s.quantity,s.returned_quantity,GREATEST(s.quantity-s.returned_quantity,0),s.rate FROM online_sale_products s JOIN products p ON p.id=s.product_id
 UNION ALL SELECT CAST('online' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci,s.online_sale_id,CAST('combo' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci,s.id,s.product_combo_id,c.combo_name,s.quantity,s.returned_quantity,GREATEST(s.quantity-s.returned_quantity,0),s.rate FROM online_sale_combos s JOIN product_combos c ON c.id=s.product_combo_id;

DROP VIEW IF EXISTS all_sales;
CREATE VIEW all_sales AS
 SELECT CAST('offline' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci channel,id,customer_id,status,notes,sales_employee_id,final_discount,0 delivery_charge,created_at,created_by FROM offline_sales
 UNION ALL SELECT CAST('online' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci,id,customer_id,status,notes,sales_employee_id,final_discount,delivery_charge,created_at,created_by FROM online_sales;
