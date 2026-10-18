-- PRINT.API.4: connection labels and the store-level canonical receipt printer.
ALTER TABLE print_api_tokens ADD COLUMN display_name VARCHAR(255) NULL AFTER store_id;
ALTER TABLE ten_stores ADD COLUMN default_receipt_printer_id BIGINT UNSIGNED NULL AFTER timezone;
UPDATE print_api_tokens SET display_name='Основное подключение' WHERE display_name IS NULL OR display_name='';
UPDATE ten_stores s INNER JOIN print_printers p
 ON p.tenant_id=s.tenant_id AND p.store_id=s.id AND p.is_default=1
 SET s.default_receipt_printer_id=p.id
 WHERE s.default_receipt_printer_id IS NULL;
