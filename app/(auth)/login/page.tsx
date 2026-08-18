"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const DEV_USERS = [
  { id: 1, name: "Admin", email: "admin@freshprints.com", role: "admin" },
  { id: 3, name: "Asif Khan", email: "asif@freshprints.com", role: "admin" },
  { id: 2, name: "esivitz@gmail.com", email: "esivitz@gmail.com", role: "supplier" },
];

const ROLE_COLOR: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  internal: "bg-blue-100 text-blue-700",
  supplier: "bg-green-100 text-green-700",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isLocalDev = !process.env.NEXT_PUBLIC_SUPABASE_URL;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLocalDev) {
        const res = await fetch("/api/local-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Sign in failed");
          return;
        }
        router.push(data.redirect);
        router.refresh();
      } else {
        // Production: Supabase auth
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setError(error.message);
          return;
        }

        // Exchange the verified Supabase token for a session cookie. The server
        // re-verifies the token and only issues a cookie for a known account.
        if (!data.session) {
          setError("Sign in failed");
          return;
        }

        const res = await fetch("/api/auth/set-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: data.session.access_token }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Sign in failed");
          return;
        }

        router.push("/orders");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-1">Fresh Prints</p>
          <h1 className="text-2xl font-bold text-gray-900">Sign in</h1>
          {isLocalDev && (
            <p className="text-xs text-amber-600 mt-1 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Dev mode — any password accepted
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:border-gray-700 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isLocalDev ? "anything" : "••••••••"}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:border-gray-700 bg-white"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gray-900 text-white text-sm font-semibold py-2.5 hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {isLocalDev && (
          <div className="mt-8">
            <p className="text-xs text-gray-400 text-center mb-3 uppercase tracking-wide font-medium">
              Quick switch (dev only)
            </p>
            <div className="space-y-2">
              {DEV_USERS.map((user) => (
                <Link
                  key={user.id}
                  href={`/api/local-session?userId=${user.id}`}
                  className="w-full flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm hover:border-gray-400 hover:shadow transition-all"
                >
                  <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-xs font-semibold text-gray-600">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{user.name}</p>
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full ${ROLE_COLOR[user.role] ?? "bg-gray-100 text-gray-600"}`}>
                    {user.role}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
