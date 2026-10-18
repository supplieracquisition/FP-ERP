"use client";

import { useState } from "react";
import { HowItWorksModal } from "./HowItWorksModal";
import { HELP_TOPICS, type HelpTopic } from "./topics";

/**
 * The "How does this work?" button, and the panel it opens.
 *
 * One component per tab's worth of explanation, so a page adds its help with a
 * single line and cannot get the dialog wiring subtly different from the next
 * page's. `topic` is typed against the registry: a tab that has no panel
 * written for it is a compile error rather than an empty dialog.
 *
 * Safe to drop into a server component — this file carries its own "use
 * client".
 */
/** The tab-header button. `className` REPLACES this; it does not add to it. */
const HEADER_BUTTON =
  "px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50 font-medium shrink-0";

export function HowItWorks({
  topic,
  label = "How does this work?",
  className,
}: {
  topic: HelpTopic;
  /** For a panel that is not the tab's own explainer and needs naming. */
  label?: string;
  /**
   * Replaces the header styling outright rather than appending to it. Two
   * Tailwind utilities for the same property in one class list are settled by
   * their order in the generated stylesheet, not by the order they are written
   * here, so appending `text-sm` to a default `text-xs` wins or loses more or
   * less at random. Replacing is the only way a caller can reliably resize it.
   */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { title, subtitle, Body } = HELP_TOPICS[topic];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className ?? HEADER_BUTTON}
      >
        {label}
      </button>
      {open && (
        <HowItWorksModal title={title} subtitle={subtitle} onClose={() => setOpen(false)}>
          <Body />
        </HowItWorksModal>
      )}
    </>
  );
}
