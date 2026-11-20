ALTER TABLE product_combos
  ADD COLUMN category_id BIGINT UNSIGNED NULL AFTER delivery_charge,
  ADD INDEX idx_product_combos_category_id (category_id),
  ADD CONSTRAINT fk_product_combos_category
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT;
