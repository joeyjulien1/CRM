"use server";

import { redirect } from "next/navigation";
import { AuthError, signIn, signOut, signUp } from "@/lib/auth/session";
import { getConfig } from "@/lib/config/version";

export interface AuthFormState {
  error?: string;
}

/** Signing in lands on a view, not on the marketing page. */
async function workspacePath(tenantId: string): Promise<string> {
  const config = await getConfig(tenantId);
  const first = config.views[0];
  return first ? `/views/${first.id}` : "/settings/history";
}

export async function signInAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  let destination: string;
  try {
    const session = await signIn(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
    destination = await workspacePath(session.tenantId);
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message };
    throw error;
  }
  redirect(destination);
}

export async function signUpAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) {
    return { error: "Use a password of at least 10 characters." };
  }

  let destination: string;
  try {
    const session = await signUp({
      email: String(formData.get("email") ?? ""),
      password,
      name: String(formData.get("name") ?? ""),
      workspace: String(formData.get("workspace") ?? ""),
    });
    destination = await workspacePath(session.tenantId);
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message };
    throw error;
  }
  redirect(destination);
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/sign-in");
}
