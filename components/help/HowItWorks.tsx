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
export function HowItWorks({ topic, className = "" }: { topic: HelpTopic; className?: string }) {
  const [open, setOpen] = useState(false);
  const { title, subtitle, Body } = HELP_TOPICS[topic];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50 font-medium shrink-0 ${className}`}
      >
        How does this work?
      </button>
      {open && (
        <HowItWorksModal title={title} subtitle={subtitle} onClose={() => setOpen(false)}>
          <Body />
        </HowItWorksModal>
      )}
    </>
  );
}
