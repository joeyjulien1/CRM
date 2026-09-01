"use client";

import * as React from "react";
import type { FieldConfig, ObjectConfig } from "@/lib/config/types";
import { validateRecord } from "@/lib/runtime/field";
import { Button } from "@/components/ui/button";
import { FieldRenderer, type FieldLookup } from "./FieldRenderer";
import { ErrorState } from "./states";
import { cn } from "@/lib/utils";

/**
 * Drives creation, editing, and public forms from the same config. Validation
 * comes from the field config — required, type, options — never from rules
 * hand-written per form.
 */

export interface FormRendererProps {
  object: ObjectConfig;
  fields: FieldConfig[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  status?: "ready" | "submitting" | "error";
  error?: string;
  /** Server-side field errors, merged with what validates here. */
  fieldErrors?: Record<string, string>;
  lookup?: FieldLookup;
  className?: string;
}

export function FormRenderer({
  object,
  fields,
  values,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  status = "ready",
  error,
  fieldErrors,
  lookup,
  className,
}: FormRendererProps) {
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = React.useState(false);

  const localErrors = React.useMemo(() => validateRecord(fields, values), [fields, values]);
  const errors = { ...localErrors, ...fieldErrors };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitAttempted(true);
    if (Object.keys(localErrors).length > 0) {
      const firstInvalid = fields.find((field) => localErrors[field.id]);
      if (firstInvalid) document.getElementById(`field-${firstInvalid.id}`)?.focus();
      return;
    }
    await onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-col gap-5", className)} noValidate>
      {status === "error" && error ? <ErrorState message={error} /> : null}

      <div className="flex flex-col gap-4">
        {fields.map((field) => {
          const showError = Boolean(errors[field.id]) && (touched[field.id] || submitAttempted);
          return (
            <div key={field.id} className="flex flex-col gap-2">
              <label htmlFor={`field-${field.id}`} className="text-xs font-medium text-content-secondary">
                {field.label}
                {field.required ? (
                  <span className="text-[var(--danger)]" aria-hidden>
                    {" "}
                    *
                  </span>
                ) : null}
              </label>

              <div id={`field-${field.id}`}>
                <FieldRenderer
                  field={field}
                  value={values[field.id] ?? null}
                  mode="edit"
                  invalid={showError}
                  lookup={lookup}
                  onChange={(value) => onChange({ ...values, [field.id]: value })}
                  onCommit={(value) => {
                    setTouched((previous) => ({ ...previous, [field.id]: true }));
                    onChange({ ...values, [field.id]: value });
                  }}
                />
              </div>

              {showError ? (
                <p role="alert" className="text-xs text-[var(--danger)]">
                  {errors[field.id]}
                </p>
              ) : field.helpText ? (
                <p className="text-xs text-content-muted">{field.helpText}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={status === "submitting"}>
          {status === "submitting" ? "Saving…" : (submitLabel ?? `Save ${object.label.toLowerCase()}`)}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
