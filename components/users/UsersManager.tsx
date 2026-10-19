"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HowItWorks } from "@/components/help/HowItWorks";
import { usePasswordLink, ManualLinkNotice } from "@/components/users/PasswordLink";

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
  currentUserId,
  onRefresh,
}: {
  user: User;
  isAdmin: boolean;
  currentUserId?: number;
  onRefresh: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  // The server refuses a self role-change and a self delete outright. This only
  // stops the UI offering controls that can never succeed.
  const isSelf = currentUserId !== undefined && user.id === currentUserId;

  // Shared with the supplier page's "Resend invite", which is the same request
  // under a label that fits what a factory is asking for.
  const { send: sendReset, sending, manualLink } = usePasswordLink(user, {
    confirmText: `Email ${user.name} a link to reset their password?`,
    sentText: (email) => `Reset link sent to ${email}`,
  });

  async function changeRole(next: string) {
    if (next === user.role) return;
    const warning =
      next === "admin"
        ? `Make ${user.name} an admin? They will be able to manage users, delete orders and see every order in the system.`
        : `Remove admin from ${user.name}? They will only see orders for the suppliers they are POC of.`;
    if (!confirm(warning)) return;

    setSavingRole(true);
    const res = await fetch(`/api/users/${user.id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    setSavingRole(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(`${user.name} is now ${next === "admin" ? "an admin" : "internal"}`);
      onRefresh();
    } else {
      toast.error(d.error ?? "Failed to change role");
      // The select is driven by `user.role`, so a refused change has to be
      // pulled back to what the server still holds — otherwise the dropdown goes
      // on showing a role that was never applied.
      onRefresh();
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
            {isAdmin && !isSelf ? (
              <select
                value={user.role}
                disabled={savingRole}
                onChange={(e) => changeRole(e.target.value)}
                className="text-xs rounded border border-gray-300 bg-white px-1.5 py-0.5 text-gray-700 focus:outline-none focus:border-gray-700 disabled:opacity-50"
              >
                <option value="internal">Internal</option>
                <option value="admin">Admin</option>
              </select>
            ) : (
              <span
                className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 capitalize"
                // Your own role is shown, never offered: the server refuses a
                // self-change, since demoting yourself locks you out of the page
                // you would need to undo it.
                title={isSelf ? "You cannot change your own role" : undefined}
              >
                {user.role}
              </span>
            )}
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
            {/* Refused by the server too — deleting yourself is a lockout with
                nothing left to undo it from. */}
            {!isSelf && (
              <button
                onClick={deleteUser}
                disabled={deleting}
                className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        )}
      </div>

      {manualLink && <ManualLinkNotice link={manualLink} name={user.name} />}
    </div>
  );
}

export function UsersManager({
  isAdmin,
  currentUserId,
}: {
  isAdmin: boolean;
  currentUserId?: number;
}) {
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
        {/* The explanation is for everyone who can read the roster; only the
            action beside it is admin-only. */}
        <div className="flex items-center gap-2">
          <HowItWorks topic="team" />
          {isAdmin && (
            <button
              onClick={() => setAdding(true)}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
            >
              + Add user
            </button>
          )}
        </div>
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
            <UserRow
              key={u.id}
              user={u}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              onRefresh={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
