CREATE TABLE IF NOT EXISTS configs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 config_name VARCHAR(150) NOT NULL,
 amount DECIMAL(15,4) NOT NULL,
 UNIQUE KEY uq_config_name (config_name)
) ENGINE=InnoDB;

INSERT INTO configs (config_name,amount)
VALUES ('DEFAULT_CONVERSION_RATE',130)
ON DUPLICATE KEY UPDATE config_name=VALUES(config_name);

CREATE TABLE IF NOT EXISTS marketing_expenses (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 barcode VARCHAR(100) NOT NULL,
 sales_person_id BIGINT UNSIGNED NOT NULL,
 amount_usd DECIMAL(15,2) NOT NULL,
 conversion_rate DECIMAL(15,4) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_by BIGINT UNSIGNED NOT NULL,
 INDEX idx_marketing_expense_created (created_at),
 INDEX idx_marketing_expense_person_created (sales_person_id,created_at),
 INDEX idx_marketing_expense_barcode_created (barcode,created_at),
 FOREIGN KEY (barcode) REFERENCES products(barcode) ON UPDATE CASCADE ON DELETE RESTRICT,
 FOREIGN KEY (sales_person_id) REFERENCES employees(id) ON DELETE RESTRICT,
 FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
