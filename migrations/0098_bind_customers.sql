INSERT OR IGNORE INTO customers (email, client_number, created_at, updated_at)
SELECT email, client_number, created_at, updated_at FROM customer_accounts;
