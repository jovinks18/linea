import type { PoolClient } from "pg";

export type CustomerRecord = {
  id: number;
  name: string | null;
  email: string;
  phone: string | null;
  telegram_id: string | null;
  preferred_channel: string | null;
  created_at: Date;
  updated_at: Date;
};

export async function findCustomerByEmail(
  client: PoolClient,
  email: string
): Promise<CustomerRecord | null> {
  const result = await client.query<CustomerRecord>(
    "SELECT * FROM customers WHERE email = $1",
    [email]
  );

  return result.rows[0] ?? null;
}

export async function createCustomer({
  client,
  email,
  preferredChannel,
}: {
  client: PoolClient;
  email: string;
  preferredChannel: string;
}): Promise<CustomerRecord> {
  const result = await client.query<CustomerRecord>(
    `INSERT INTO customers (email, preferred_channel)
     VALUES ($1, $2)
     RETURNING *`,
    [email, preferredChannel]
  );

  return result.rows[0];
}

export async function findOrCreateCustomer({
  client,
  email,
  preferredChannel,
}: {
  client: PoolClient;
  email: string;
  preferredChannel: string;
}): Promise<CustomerRecord> {
  const existingCustomer = await findCustomerByEmail(client, email);

  if (existingCustomer) {
    return existingCustomer;
  }

  return createCustomer({
    client,
    email,
    preferredChannel,
  });
}
