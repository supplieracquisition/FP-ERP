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

function ResetPasswordForm({ userId, onDone }: { userId: number; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Password updated");
      setPassword("");
      onDone();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Failed to reset password");
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 mt-1">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        minLength={8}
        required
        className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700 w-40"
      />
      <button
        type="submit"
        disabled={saving}
        className="text-xs bg-gray-900 text-white px-2 py-1 rounded hover:bg-gray-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Set"}
      </button>
      <button type="button" onClick={onDone} className="text-xs text-gray-400 hover:text-gray-600">
        Cancel
      </button>
    </form>
  );
}

function UserRow({ user, onRefresh }: { user: User; onRefresh: () => void }) {
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteUser() {
    if (!confirm(`Delete ${user.name}? They will lose access immediately.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      toast.success("User deleted");
      onRefresh();
    } else {
      const d = await res.json().catch(() => ({}));
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
          {resetting && (
            <ResetPasswordForm userId={user.id} onDone={() => setResetting(false)} />
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {!resetting && (
            <button
              onClick={() => setResetting(true)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Reset password
            </button>
          )}
          <button
            onClick={deleteUser}
            disabled={deleting}
            className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UsersManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("User created");
      setAdding(false);
      setName(""); setEmail(""); setPassword(""); setRole("internal");
      load();
    } else {
      const d = await res.json().catch(() => ({}));
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
        <button
          onClick={() => setAdding(true)}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
        >
          + Add user
        </button>
      </div>

      {adding && (
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
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 characters)"
            required
            minLength={8}
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
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="text-sm bg-gray-900 text-white px-4 py-1.5 rounded hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create"}
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
            <UserRow key={u.id} user={u} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  );
}
