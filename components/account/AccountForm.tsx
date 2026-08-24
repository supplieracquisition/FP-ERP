"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const INPUT =
  "w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700 disabled:bg-gray-50 disabled:text-gray-500";

/** Matches the server's rule and the invite landing page. */
const MIN_PASSWORD_LENGTH = 8;

export default function AccountForm({
  initialName,
  email,
  role,
  signInEmail,
  passwordsAvailable,
}: {
  initialName: string;
  /** users.email — the ERP's copy, used for display and notifications. */
  email: string;
  role: string;
  /** Supabase's verified address, or null when it could not be read. */
  signInEmail: string | null;
  passwordsAvailable: boolean;
}) {
  return (
    <div className="space-y-8 max-w-3xl">
      <DetailsSection
        initialName={initialName}
        email={email}
        role={role}
        signInEmail={signInEmail}
      />
      <PasswordSection available={passwordsAvailable} />
    </div>
  );
}

function DetailsSection({
  initialName,
  email,
  role,
  signInEmail,
}: {
  initialName: string;
  email: string;
  role: string;
  signInEmail: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [saving, setSaving] = useState(false);

  const dirty = name !== saved;

  // Only when Supabase actually answered. A null signInEmail means "unknown"
  // — no Supabase configured, or it was unreachable — and must never be
  // rendered as a disagreement between the two addresses.
  const drifted = signInEmail !== null && signInEmail.toLowerCase() !== email.toLowerCase();

  async function save() {
    setSaving(true);
    try {
      // Only the one editable field is sent. The server refuses any key outside
      // its allowlist, so this body must never be widened to the whole form.
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Could not save your changes");
        return;
      }

      setSaved(name);
      toast.success("Saved");
      // The header renders the session, which carries the old name until this.
      router.refresh();
    } catch {
      toast.error("Could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border border-gray-200 rounded-lg bg-white">
      <div className="px-5 py-4 border-b border-gray-200">
        <h2 className="text-sm font-bold text-gray-900">Your details</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Only you can edit this page, and only your own account.
        </p>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              value={name}
              disabled={saving}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <input value={role} disabled className={`${INPUT} capitalize`} />
            <p className="text-xs text-gray-400 mt-1">Set by an admin.</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input value={email} disabled className={INPUT} />
          <p className="text-xs text-gray-400 mt-1">
            This is the address you sign in with and where we send your notifications. It
            is your login identity, so an admin has to change it.
          </p>
        </div>

        {drifted && (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-800">
              <span className="font-semibold">These addresses disagree.</span> You sign in
              with <strong>{signInEmail}</strong>, but the ERP has{" "}
              <strong>{email}</strong> on file and sends notifications there. Ask an admin
              to line them up.
            </p>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-3">
        {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
        <button
          onClick={save}
          disabled={!dirty || saving || name.trim() === ""}
          className="text-xs font-semibold bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-700 disabled:bg-gray-300 transition-colors"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </section>
  );
}

function PasswordSection({ available }: { available: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const complete = current !== "" && next !== "" && confirm !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    // The mismatch is caught here because the server never sees `confirm` —
    // it is a typing check, not a rule about the password.
    if (next !== confirm) {
      toast.error("Your new passwords do not match");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Could not change your password");
        return;
      }

      // The response carries rotated auth cookies, so the session survives.
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed. You are still signed in here.");
    } catch {
      toast.error("Could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border border-gray-200 rounded-lg bg-white">
      <div className="px-5 py-4 border-b border-gray-200">
        <h2 className="text-sm font-bold text-gray-900">Password</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Changing this changes how you sign in. You stay signed in on this device.
        </p>
      </div>

      {!available ? (
        <p className="p-5 text-xs text-gray-500">
          This environment uses the local dev sign-in stub, which has no passwords.
        </p>
      ) : (
        <form onSubmit={submit}>
          <div className="p-5 space-y-4">
            <div className="sm:max-w-xs">
              <label
                className="block text-xs font-medium text-gray-600 mb-1"
                htmlFor="currentPassword"
              >
                Current password
              </label>
              <input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={current}
                disabled={saving}
                onChange={(e) => setCurrent(e.target.value)}
                className={INPUT}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  className="block text-xs font-medium text-gray-600 mb-1"
                  htmlFor="newPassword"
                >
                  New password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  value={next}
                  disabled={saving}
                  onChange={(e) => setNext(e.target.value)}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  className={INPUT}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-medium text-gray-600 mb-1"
                  htmlFor="confirmPassword"
                >
                  Confirm new password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  disabled={saving}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className={INPUT}
                />
              </div>
            </div>
          </div>

          <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
            <button
              type="submit"
              disabled={!complete || saving}
              className="text-xs font-semibold bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-700 disabled:bg-gray-300 transition-colors"
            >
              {saving ? "Changing…" : "Change password"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
