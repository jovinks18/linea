import { getCurrentOperator } from "../../lib/auth/current-operator";
import { ChatPageClient } from "./ChatPageClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ChatPage() {
  const operator = await getCurrentOperator();

  return <ChatPageClient operatorAuthenticated={operator !== null} />;
}
