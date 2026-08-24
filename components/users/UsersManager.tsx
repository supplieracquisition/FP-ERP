"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

type User = {
  id: number;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

function UserRow({
  user,
  isAdmin,
  onRefresh,
}: {
  user: User;
  isAdmin: boolean;
  onRefresh: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function sendReset() {
    if (!confirm(`Email ${user.name} a link to reset their password?`)) return;
    setSending(true);
    const res = await fetch(`/api/users/${user.id}`, { method: "PATCH" });
    setSending(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(`Reset link sent to ${d.sentTo ?? user.email}`);
    } else {
      toast.error(d.error ?? "Failed to send the reset link");
    }
  }

  async function deleteUser() {
    if (!confirm(`Delete ${user.name}? They will lose access immediately.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    setDeleting(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      // authDeleted === false means the row is gone and access is revoked, but
      // the Supabase login lingers and will block re-inviting this address.
      toast.success(
        d.authDeleted === false
          ? "User deleted — but their Supabase login could not be removed. Clear it in Supabase before reusing this email."
          : "User deleted",
        d.authDeleted === false ? { duration: 10000 } : undefined
      );
      onRefresh();
    } else {
      toast.error(d.error ?? "Failed to delete user");
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-900">{user.name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 capitalize">
              {user.role}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{user.email}</p>
        </div>

        {/* Presentation only. /api/users refuses a non-admin either way. */}
        {isAdmin && (
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={sendReset}
              disabled={sending}
              className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send reset email"}
            </button>
            <button
              onClick={deleteUser}
              disabled={deleting}
              className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function UsersManager({ isAdmin }: { isAdmin: boolean }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("internal");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    // No password field: the invitee sets their own from the email. One
    // collected here would have been discarded anyway — accounts are Supabase
    // Auth accounts, and nothing in this app stores a password.
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role }),
    });
    setSaving(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(
        d.invited === false ? "Local dev login created" : `Invite sent to ${email}`
      );
      setAdding(false);
      setName(""); setEmail(""); setRole("internal");
      load();
    } else {
      toast.error(d.error ?? "Failed to create user");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} internal user{users.length !== 1 ? "s" : ""}</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            + Add user
          </button>
        )}
      </div>

      {isAdmin && adding && (
        <form onSubmit={createUser} className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900">New user</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            required
            className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-gray-700 bg-white"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-gray-700 bg-white"
          />
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700 bg-white"
            >
              <option value="internal">Internal</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <p className="text-xs text-gray-500">
            They&apos;ll get an email to set their own password.
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="text-sm bg-gray-900 text-white px-4 py-1.5 rounded hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? "Sending…" : "Send invite"}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No users yet.</p>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <UserRow key={u.id} user={u} isAdmin={isAdmin} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  );
}
