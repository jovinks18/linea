import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

export const OPERATOR_SESSION_COOKIE = "linea_operator_session";
export const OPERATOR_SESSION_TTL_SECONDS = 8 * 60 * 60;

export type OperatorSession = {
  username: string;
  role: "policy_admin";
  session_id: string;
  issued_at: number;
  expires_at: number;
};

export type OperatorAuthConfig = {
  username: string;
  password: string;
  sessionSecret: string;
};

function safeEqual(value: string, expected: string) {
  const valueDigest = createHash("sha256").update(value).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(valueDigest, expectedDigest);
}

function signPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function isOperatorSession(value: unknown): value is OperatorSession {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const session = value as Record<string, unknown>;
  return (
    typeof session.username === "string" &&
    session.username.length > 0 &&
    session.role === "policy_admin" &&
    typeof session.session_id === "string" &&
    session.session_id.length > 0 &&
    typeof session.issued_at === "number" &&
    Number.isSafeInteger(session.issued_at) &&
    typeof session.expires_at === "number" &&
    Number.isSafeInteger(session.expires_at)
  );
}

export function getOperatorAuthConfig(
  env: NodeJS.ProcessEnv = process.env
): OperatorAuthConfig | null {
  const username = env.LINEA_ADMIN_USERNAME?.trim() ?? "";
  const password = env.LINEA_ADMIN_PASSWORD ?? "";
  const sessionSecret = env.LINEA_SESSION_SECRET ?? "";

  if (
    !username ||
    password.length < 12 ||
    sessionSecret.length < 32
  ) {
    return null;
  }

  return { username, password, sessionSecret };
}

export function authenticateOperatorCredentials(
  input: { username: string; password: string },
  config: OperatorAuthConfig
) {
  const usernameMatches = safeEqual(input.username.trim(), config.username);
  const passwordMatches = safeEqual(input.password, config.password);
  return usernameMatches && passwordMatches;
}

export function createOperatorSessionToken({
  username,
  sessionSecret,
  now = new Date(),
  sessionId = randomUUID(),
}: {
  username: string;
  sessionSecret: string;
  now?: Date;
  sessionId?: string;
}) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const session: OperatorSession = {
    username,
    role: "policy_admin",
    session_id: sessionId,
    issued_at: issuedAt,
    expires_at: issuedAt + OPERATOR_SESSION_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${signPayload(payload, sessionSecret)}`;
}

export function verifyOperatorSessionToken({
  token,
  sessionSecret,
  now = new Date(),
}: {
  token: string;
  sessionSecret: string;
  now?: Date;
}): OperatorSession | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  const expectedSignature = signPayload(payload, sessionSecret);

  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as unknown;

    if (!isOperatorSession(parsed)) return null;

    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (
      parsed.issued_at > nowSeconds ||
      parsed.expires_at <= nowSeconds ||
      parsed.expires_at - parsed.issued_at !== OPERATOR_SESSION_TTL_SECONDS
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
