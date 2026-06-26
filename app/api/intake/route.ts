import { NextResponse } from "next/server";
import { processIntakeMessage } from "../../../lib/intake/service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      channel = "web_chat",
      customer_email,
      case_number,
      message,
    } = body;

    if (!customer_email || !message) {
      return NextResponse.json(
        { error: "customer_email and message are required" },
        { status: 400 }
      );
    }

    const result = await processIntakeMessage({
      channel,
      customer_email,
      case_number,
      message,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Linea intake error:", error);

    return NextResponse.json(
      { error: "Failed to process support message" },
      { status: 500 }
    );
  }
}
