"use server";

import { redirect } from "next/navigation";
import { AuthError, signIn, signOut, signUp } from "@/lib/auth/session";

export interface AuthFormState {
  error?: string;
}

export async function signInAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  try {
    await signIn(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message };
    throw error;
  }
  redirect("/");
}

export async function signUpAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) {
    return { error: "Use a password of at least 10 characters." };
  }

  try {
    await signUp({
      email: String(formData.get("email") ?? ""),
      password,
      name: String(formData.get("name") ?? ""),
      workspace: String(formData.get("workspace") ?? ""),
    });
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message };
    throw error;
  }
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/sign-in");
}
