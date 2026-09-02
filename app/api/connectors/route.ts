import { getSession } from "@/lib/auth/session";
import { connectorStates } from "@/lib/connectors/status";

/** Connection status for the signed-in user. Never returns a token. */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Sign in to continue.", { status: 401 });

  const states = await connectorStates(session.tenantId, session.userId);
  return Response.json({ connectors: states });
}
