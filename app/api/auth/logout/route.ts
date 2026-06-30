import { cookies } from "next/headers";
import { OPERATOR_SESSION_COOKIE } from "../../../../lib/auth/operator-session";

export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set(OPERATOR_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    priority: "high",
  });

  return Response.json({ signed_out: true });
}
