"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Where a supplier lands from their invite email.
 *
 * Supabase's /auth/v1/verify does the token check and bounces here with the
 * session in the URL fragment (#access_token=…). A fragment never reaches the
 * server, so this page must be public in proxy.ts — otherwise the proxy sees no
 * session cookie, redirects to /login, and the tokens are gone.
 *
 * Both link styles are handled: the fragment that /auth/v1/verify produces, and
 * the ?token_hash=&type= form a project using the newer email templates sends.
 * Which one arrives depends on Supabase's template config, not on anything here.
 */
export default function SetPasswordPage() {
  const router = useRouter();

  // Captured during the first render, before the Supabase client is created:
  // detectSessionInUrl may consume and clear the fragment on its own, and this
  // copy makes that a race we cannot lose either way.
  const [initialHash] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash
  );

  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const hashParams = new URLSearchParams(
        initialHash.startsWith("#") ? initialHash.slice(1) : initialHash
      );
      const searchParams = new URLSearchParams(window.location.search);

      const linkError =
        hashParams.get("error_description") ?? searchParams.get("error_description");
      if (linkError) {
        if (!cancelled) { setError(linkError); setStatus("invalid"); }
        return;
      }

      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");

      let established = false;

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        established = !error;
        if (error && !cancelled) setError(error.message);
      } else if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "invite" | "recovery" | "email",
        });
        established = !error;
        if (error && !cancelled) setError(error.message);
      } else {
        // No token in the URL. An already-signed-in user can still set a
        // password here — that is the "change my password" case.
        const { data } = await supabase.auth.getSession();
        established = Boolean(data.session);
        if (!established && !cancelled) {
          setError("This invite link is missing its token. Open the link from your email again.");
        }
      }

      // Keep the tokens out of the address bar and out of browser history.
      window.history.replaceState(null, "", window.location.pathname);

      if (!cancelled) setStatus(established ? "ready" : "invalid");
    })();

    return () => { cancelled = true; };
  }, [initialHash]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      // Same cookie-issuing path as the login page: the server re-verifies the
      // token and only issues a cookie for an account that exists here.
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setError("Password saved, but the session expired. Sign in with your new password.");
        return;
      }

      const res = await fetch("/api/auth/set-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: data.session.access_token }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Password saved, but sign-in failed. Try signing in.");
        return;
      }

      // Suppliers get bounced to /supplier/orders by the internal layout's
      // requireInternal(), so this one destination is right for either role.
      router.push("/orders");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-1">Fresh Prints</p>
          <h1 className="text-2xl font-bold text-gray-900">Set your password</h1>
          <p className="text-sm text-gray-500 mt-1">
            Choose a password for your supplier portal account.
          </p>
        </div>

        {status === "checking" && (
          <p className="text-sm text-gray-400 text-center py-8">Checking your invite…</p>
        )}

        {status === "invalid" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm text-red-700">{error || "This invite link is not valid."}</p>
            <p className="text-xs text-red-600 mt-2">
              Invite links expire. Ask your Fresh Prints contact to send a new one.
            </p>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="password">
                New password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:border-gray-700 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="confirm">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:border-gray-700 bg-white"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-gray-900 text-white text-sm font-semibold py-2.5 hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Set password and continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
