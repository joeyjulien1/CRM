"use client";

/**
 * Anything on a screen can hand the agent a starting prompt — the blueprint's
 * inspector, the template gallery, the command palette. The panel itself lives
 * in the shell, so the request travels as an event rather than as a prop
 * threaded through every screen.
 */
export const ASK_AGENT_EVENT = "crm:ask-agent";

export function askAgent(prompt: string): void {
  window.dispatchEvent(new CustomEvent<string>(ASK_AGENT_EVENT, { detail: prompt }));
}

export function onAskAgent(handler: (prompt: string) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<string>).detail);
  window.addEventListener(ASK_AGENT_EVENT, listener);
  return () => window.removeEventListener(ASK_AGENT_EVENT, listener);
}
