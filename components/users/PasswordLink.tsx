"use client";

import { useState } from "react";
import { toast } from "sonner";

/**
 * Email someone a link to set their own password.
 *
 * One mechanism, two labels. The Team page calls it "Send reset email"; a
 * supplier's portal login calls it "Resend invite" — a factory whose invite
 * expired, or who lost the email, needs exactly this and until now had no way
 * to ask for it. Both send the same Supabase recovery mail, and /set-password
 * accepts a `recovery` link exactly as it accepts an `invite` one, so someone
 * who never set a password still lands on the same page and chooses one.
 *
 * Recovery rather than a second invite on purpose: PATCH /api/users/[id] sends
 * it on the anon key, so it keeps working while SUPABASE_SERVICE_ROLE_KEY is
 * unset — which real invites do not — and Supabase refuses to re-invite an
 * address it already holds.
 *
 * A hook plus a separate notice rather than one button component: the
 * rate-limit notice has to sit BELOW the row it belongs to, and the two pages
 * build their rows differently. Layout stays with the caller; only the request
 * and its three outcomes live here.
 */
export function usePasswordLink(
  user: { id: number; name: string; email: string },
  {
    confirmText,
    sentText,
  }: {
    /** Shown in the confirm dialog before anything is sent. */
    confirmText: string;
    /** Success toast, given the address the server reports it sent to. */
    sentText: (email: string) => string;
  }
) {
  const [sending, setSending] = useState(false);
  // Set only when Supabase's hourly email cap stopped the email going out and
  // the server handed back the link instead, for the admin to pass on by hand.
  const [manualLink, setManualLink] = useState<string | null>(null);

  async function send() {
    if (!confirm(confirmText)) return;
    setSending(true);
    setManualLink(null);
    const res = await fetch(`/api/users/${user.id}`, { method: "PATCH" });
    setSending(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.rateLimited) {
      setManualLink(d.link);
      toast.warning("Supabase's hourly email limit is used up — send this link yourself", {
        duration: 10000,
      });
    } else if (res.ok) {
      toast.success(sentText(d.sentTo ?? user.email));
    } else {
      toast.error(d.error ?? "Failed to send the link");
    }
  }

  return { send, sending, manualLink };
}

/**
 * The link the admin has to pass on by hand, shown when no email went out.
 *
 * Supabase's built-in sender allows roughly two messages an hour for the whole
 * project, and onboarding several people at once spends that immediately. The
 * server mints the same link it would have emailed, so a spent quota is a
 * slower path rather than a dead end.
 */
export function ManualLinkNotice({ link, name }: { link: string; name: string }) {
  return (
    <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs text-amber-900">
        No email was sent — Supabase&apos;s built-in sender allows about 2 per hour
        for the whole app. Send {name} this link yourself. It works once and
        expires in an hour.
      </p>
      {/* readOnly, not disabled: disabled inputs can't be selected or copied. */}
      <div className="mt-2 flex items-center gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-mono text-gray-700"
        />
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              toast.success("Link copied");
            } catch {
              // Clipboard access is refused outside HTTPS and in some
              // browsers. The input above is still there to copy by hand.
              toast.error("Couldn't copy — select the link and copy it manually");
            }
          }}
          className="shrink-0 rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700"
        >
          Copy
        </button>
      </div>
    </div>
  );
}
