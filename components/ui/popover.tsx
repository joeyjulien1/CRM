"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

/**
 * shadcn popover, with one deliberate change: it does not portal.
 *
 * Type and control sizes come from `--text-*` and `--control-h`, which are
 * defined on the `[data-density]` container, not on :root — see
 * docs/DESIGN.md. A portal renders on document.body, outside that container,
 * where those variables resolve to nothing and every size silently falls back
 * to a browser default. Staying in the tree keeps the density it was designed
 * against.
 */
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Content
    ref={ref}
    align={align}
    sideOffset={sideOffset}
    className={cn(
      "z-50 rounded border border-edge bg-surface-raised p-0 text-content shadow-[0_8px_24px_rgba(0,0,0,0.12)] outline-none",
      className,
    )}
    {...props}
  />
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
