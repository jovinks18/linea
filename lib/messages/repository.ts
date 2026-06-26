import type { PoolClient } from "pg";

export type MessageRecord = {
  id: number;
};

export async function createMessage({
  client,
  caseId,
  customerId,
  channel,
  senderType,
  messageText,
  internalOnly,
  aiGenerated,
}: {
  client: PoolClient;
  caseId: number;
  customerId: number;
  channel: string;
  senderType: "customer" | "ai";
  messageText: string;
  internalOnly: boolean;
  aiGenerated: boolean;
}): Promise<MessageRecord> {
  const result = await client.query<MessageRecord>(
    `INSERT INTO messages
      (case_id, customer_id, channel, sender_type, message_text, internal_only, ai_generated)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      caseId,
      customerId,
      channel,
      senderType,
      messageText,
      internalOnly,
      aiGenerated,
    ]
  );

  return result.rows[0];
}
