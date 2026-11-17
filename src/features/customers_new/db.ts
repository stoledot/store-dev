import type {D1Database} from '@cloudflare/workers-types';
import type { Customer } from './types';

export const getCustomerById = async (db: D1Database, id: number): Promise<Customer | null> => {
    // Implementation to fetch a customer by ID from the database
    return db.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first('Customer');
};

export const createCustomer = async (
  db: D1Database,
  customer: Omit<Customer, 'id' | 'created_at' | 'updated_at'>
): Promise<Customer> => {
  const newCustomer = await db
    .prepare(
      'INSERT INTO customers (client_number, name, email) VALUES (?, ?, ?) RETURNING *'
    )
    .bind(customer.client_number, customer.name, customer.email)
    .first<Customer>();

  if (!newCustomer) {
    throw new Error('No se pudo crear el cliente');
  }

  return newCustomer;
};


export const updateCustomer = async (db: D1Database, id: number, customer: Partial<Omit<Customer, 'id' | 'created_at' | 'updated_at'>>): Promise<Customer | null> => {
    // Implementation to update an existing customer in the database
    const updatedCustomer = await db
        .prepare(
            'UPDATE customers SET client_number = ?, name = ?, email = ?, updated_at = ? WHERE id = ? RETURNING *'
        )
        .bind(
            customer.client_number ?? null,
            customer.name ?? null,
            customer.email ?? null,
            new Date().toISOString(),
            id
        )
        .first<Customer>();

    return updatedCustomer ?? null;
};

export const getCustomerByClientNumber = async (db: D1Database, client_number: string): Promise<Customer | null> => {
    // Implementation to fetch a customer by client number from the database
    const customer = await db
        .prepare('SELECT * FROM customers WHERE client_number = ?')
        .bind(client_number)
        .first<Customer>();

    return customer ?? null;
};


export const getCustomerByEmail = async (db: D1Database, email: string): Promise<Customer | null> => {
    const customer = await db
        .prepare('SELECT * FROM customers WHERE email = ?')
        .bind(email)
        .first<Customer>();

    return customer ?? null;
};
