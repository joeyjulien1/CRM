import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/client";
import { emailAccounts } from "@/lib/db/schema";
import { encryptToken } from "@/lib/email/crypto";
import { exchangeCode, getProfile } from "@/lib/email/gmail";
import { enqueue, QUEUES } from "@/lib/jobs/queue";
import type { EmailJob } from "@/lib/email/worker";

const STATE_COOKIE = "gmail_oauth_state";

export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Sign in to continue.", { status: 401 });

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (!code) return new Response("Google did not return an authorization code.", { status: 400 });
  if (!state || state !== expected) {
    return new Response("That sign-in did not start here. Try connecting again.", { status: 400 });
  }

  try {
    const token = await exchangeCode(code);
    const profile = await getProfile(token.accessToken);

    // OAuth is per user, not per tenant, so the row carries both.
    const accountId = await withTenant(session.tenantId, async (db) => {
      const [account] = await db
        .insert(emailAccounts)
        .values({
          tenantId: session.tenantId,
          userId: session.userId,
          provider: "gmail",
          address: token.address,
          refreshTokenEnc: encryptToken(token.refreshToken),
          accessTokenEnc: encryptToken(token.accessToken),
          accessTokenExpiresAt: token.expiresAt,
          historyId: profile.historyId,
        })
        .onConflictDoUpdate({
          target: [emailAccounts.tenantId, emailAccounts.userId, emailAccounts.address],
          set: {
            refreshTokenEnc: encryptToken(token.refreshToken),
            accessTokenEnc: encryptToken(token.accessToken),
            accessTokenExpiresAt: token.expiresAt,
            historyId: profile.historyId,
          },
        })
        .returning({ id: emailAccounts.id });
      return account?.id;
    });

    if (accountId) {
      // Backfill and live sync are separate jobs from here on.
      await enqueue<EmailJob>(QUEUES.emailBackfill, { tenantId: session.tenantId, accountId });
      await enqueue<EmailJob>(QUEUES.emailSync, { tenantId: session.tenantId, accountId });
    }

    return Response.redirect(new URL("/settings/email?connected=1", url.origin), 302);
  } catch (error) {
    console.error("gmail callback failed:", error);
    return Response.redirect(new URL("/settings/email?error=1", url.origin), 302);
  }
}
