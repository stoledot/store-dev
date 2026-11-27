/**
ALTER TABLE school_lecturas_customers ADD COLUMN expiration_date TEXT;
ALTER TABLE school_lecturas_customers ADD COLUMN purchase_date TEXT;
ALTER TABLE school_lecturas_customers ADD COLUMN number_of_plans INTEGER;
ALTER TABLE school_lecturas_customers ADD COLUMN simultaneous_devices INTEGER;
*/

ALTER TABLE products_lecturas ADD COLUMN expiration_days INTEGER;
ALTER TABLE products_lecturas ADD COLUMN number_of_plans INTEGER;
ALTER TABLE products_lecturas ADD COLUMN simultaneous_devices INTEGER;

