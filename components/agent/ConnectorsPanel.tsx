"use client";

import * as React from "react";
import { Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ConnectorState } from "./useConnectors";

/**
 * The connectors panel, opened from the composer.
 *
 * It sits where the work is. Sending someone to a settings page to connect an
 * account mid-conversation loses the conversation, and the reason they wanted
 * the account connected along with it.
 */

export interface ConnectorsPanelProps {
  connectors: ConnectorState[];
  loading: boolean;
  busy: string | null;
  error: string | null;
  onConnect: (provider: string) => void;
  onDisconnect: (provider: string) => void;
}

export function ConnectorsPanel({
  connectors,
  loading,
  busy,
  error,
  onConnect,
  onDisconnect,
}: ConnectorsPanelProps) {
  const [open, setOpen] = React.useState(false);
  const connectedCount = connectors.filter((c) => c.connected).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Connectors${connectedCount > 0 ? `, ${connectedCount} connected` : ""}`}
          title="Connectors"
          className="relative"
        >
          <Plug className="h-4 w-4" aria-hidden />
          {connectedCount > 0 && (
            <span
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--success)]"
              aria-hidden
            />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" side="top" className="w-[320px]">
        <div className="border-b border-edge px-3 py-2">
          <p className="text-sm font-medium">Connectors</p>
          <p className="mt-0.5 text-xs text-content-secondary">
            Connect an account and the agent can use it in this conversation.
          </p>
        </div>

        <div className="max-h-[320px] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-2 p-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-surface-hover" />
              ))}
            </div>
          ) : (
            connectors.map((connector) => (
              <ConnectorRow
                key={connector.provider}
                connector={connector}
                busy={busy === connector.provider}
                onConnect={onConnect}
                onDisconnect={onDisconnect}
              />
            ))
          )}
        </div>

        {error && (
          <p className="border-t border-edge px-3 py-2 text-xs text-[var(--danger)]">{error}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ConnectorRow({
  connector,
  busy,
  onConnect,
  onDisconnect,
}: {
  connector: ConnectorState;
  busy: boolean;
  onConnect: (provider: string) => void;
  onDisconnect: (provider: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-edge px-3 py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm">{connector.label}</p>
        <p className="mt-0.5 truncate text-xs text-content-secondary">
          {connector.connected ? `Connected as ${connector.account}` : connector.blurb}
        </p>
        {!connector.configured && (
          <Badge tone="neutral" className="mt-1">
            Not set up on this deployment
          </Badge>
        )}
      </div>

      {connector.connected ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onDisconnect(connector.provider)}
        >
          {busy ? "Disconnecting…" : "Disconnect"}
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || !connector.configured}
          onClick={() => onConnect(connector.provider)}
        >
          {busy ? "Connecting…" : "Connect"}
        </Button>
      )}
    </div>
  );
}
