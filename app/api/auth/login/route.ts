import { cookies } from "next/headers";
import {
  authenticateOperatorCredentials,
  createOperatorSessionToken,
  getOperatorAuthConfig,
  OPERATOR_SESSION_COOKIE,
  OPERATOR_SESSION_TTL_SECONDS,
} from "../../../../lib/auth/operator-session";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const config = getOperatorAuthConfig();

  if (!config) {
    return Response.json(
      {
        errors: [
          "Operator authentication is not configured. Set the LINEA_ADMIN_USERNAME, LINEA_ADMIN_PASSWORD, and LINEA_SESSION_SECRET environment variables.",
        ],
      },
      { status: 503 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { errors: ["Request body must be valid JSON."] },
      { status: 400 }
    );
  }

  const username =
    isRecord(body) && typeof body.username === "string" ? body.username : "";
  const password =
    isRecord(body) && typeof body.password === "string" ? body.password : "";

  if (
    !authenticateOperatorCredentials({ username, password }, config)
  ) {
    return Response.json(
      { errors: ["Invalid operator credentials."] },
      { status: 401 }
    );
  }

  const token = createOperatorSessionToken({
    username: config.username,
    sessionSecret: config.sessionSecret,
  });
  const cookieStore = await cookies();
  cookieStore.set(OPERATOR_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OPERATOR_SESSION_TTL_SECONDS,
    priority: "high",
  });

  return Response.json({
    operator: {
      username: config.username,
      role: "policy_admin",
    },
  });
}
