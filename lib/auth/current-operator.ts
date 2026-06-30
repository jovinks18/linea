import { cookies } from "next/headers";
import {
  getOperatorAuthConfig,
  OPERATOR_SESSION_COOKIE,
  verifyOperatorSessionToken,
} from "./operator-session";

export async function getCurrentOperator() {
  const config = getOperatorAuthConfig();
  if (!config) return null;

  const token = (await cookies()).get(OPERATOR_SESSION_COOKIE)?.value;
  if (!token) return null;

  return verifyOperatorSessionToken({
    token,
    sessionSecret: config.sessionSecret,
  });
}

export function operatorUnauthorizedResponse() {
  return Response.json(
    { errors: ["Authenticated policy administrator session required."] },
    { status: 401 }
  );
}
