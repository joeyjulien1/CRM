import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { authorizeUrl } from "@/lib/email/gmail";

const STATE_COOKIE = "gmail_oauth_state";

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Sign in to continue.", { status: 401 });

  // The state cookie is what makes the callback verifiable as ours.
  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  try {
    return Response.redirect(authorizeUrl(state), 302);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Gmail is not configured.", {
      status: 500,
    });
  }
}
