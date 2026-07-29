"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";

type SupplierUser = { id: number; name: string; email: string };
type InternalUser = { id: number; name: string };

type Supplier = {
  id: number;
  name: string;
  nickname: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  pocName: string | null;
  pocEmail: string | null;
  pocPhone: string | null;
  salesRepName: string | null;
  address: string | null;
  comments: string | null;
  turnTime: number | null;
  capacityUnits: number | null;
  testPrintTat: number | null;
  productionTime: number | null;
  shippingTimeAir: number | null;
  shippingTimeSea: number | null;
  active: boolean;
  pocUserId: number | null;
  createdAt: string;
  orderCount: number;
  users: SupplierUser[];
};

function AddUserForm({ supplierId, onSaved }: { supplierId: number; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/suppliers/${supplierId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userEmail: email, userPassword: password, userName: name }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Login created");
      setOpen(false);
      setEmail(""); setName(""); setPassword("");
      onSaved();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Failed to create login");
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-blue-600 hover:text-blue-800">
        + Add login
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 p-3 bg-gray-50 rounded-md border border-gray-200">
      <p className="text-xs font-semibold text-gray-700">New supplier login</p>
      <input
        value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
        className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700"
        required
      />
      <input
        type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
        className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700"
        required
      />
      <input
        type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password"
        className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700"
        required minLength={8}
      />
      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="text-xs bg-gray-900 text-white px-3 py-1 rounded hover:bg-gray-700 disabled:opacity-50">
          {saving ? "Creating…" : "Create"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

function InlineNumber({ label, value, onSave }: {
  label: string;
  value: number | null;
  onSave: (v: number | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Keep draft in sync when parent refreshes (e.g. after another field saves)
  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  const parsed = draft.trim() === "" ? null : parseInt(draft);
  const dirty = parsed !== value;

  async function commit() {
    if (!dirty) return;
    setSaving(true);
    await onSave(parsed);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number" min="0" value={draft}
          onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          placeholder="—"
          className={`w-24 text-sm border rounded px-2 py-1 focus:outline-none tabular-nums transition-colors ${
            dirty ? "border-blue-400 focus:border-blue-600" : "border-gray-300 focus:border-gray-700"
          }`}
        />
        {dirty && !saving && (
          <button onClick={commit}
            className="text-xs bg-gray-900 text-white px-2 py-1 rounded hover:bg-gray-700 whitespace-nowrap">
            Save
          </button>
        )}
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
        {saved && !dirty && <span className="text-xs text-green-600">✓</span>}
      </div>
    </div>
  );
}

function SupplierRow({ supplier, onRefresh, internalUsers }: {
  supplier: Supplier;
  onRefresh: () => void;
  internalUsers: InternalUser[];
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(supplier.name);
  const [nickname, setNickname] = useState(supplier.nickname ?? "");
  const [email, setEmail] = useState(supplier.contactEmail ?? "");
  const [phone, setPhone] = useState(supplier.contactPhone ?? "");
  const [pocName, setPocName] = useState(supplier.pocName ?? "");
  const [pocEmail, setPocEmail] = useState(supplier.pocEmail ?? "");
  const [pocPhone, setPocPhone] = useState(supplier.pocPhone ?? "");
  const [salesRep, setSalesRep] = useState(supplier.salesRepName ?? "");
  const [address, setAddress] = useState(supplier.address ?? "");
  const [comments, setComments] = useState(supplier.comments ?? "");
  const [saving, setSaving] = useState(false);
  const [impersonating, setImpersonating] = useState(false);

  async function viewAsSupplier() {
    setImpersonating(true);
    const res = await fetch("/api/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId: supplier.id }),
    });
    if (res.ok) {
      window.location.href = "/supplier/orders";
    } else {
      setImpersonating(false);
    }
  }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/suppliers/${supplier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        nickname: nickname || null,
        contactEmail: email || null,
        contactPhone: phone || null,
        pocName: pocName || null,
        pocEmail: pocEmail || null,
        pocPhone: pocPhone || null,
        salesRepName: salesRep || null,
        address: address || null,
        comments: comments || null,
      }),
    });
    setSaving(false);
    if (res.ok) { toast.success("Saved"); setEditing(false); onRefresh(); }
    else toast.error("Failed to save");
  }

  async function saveCapacityField(field: "turnTime" | "capacityUnits" | "testPrintTat" | "productionTime" | "shippingTimeAir" | "shippingTimeSea", value: number | null) {
    const res = await fetch(`/api/suppliers/${supplier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) onRefresh();
    else toast.error("Failed to save");
  }

  async function toggleActive() {
    const res = await fetch(`/api/suppliers/${supplier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !supplier.active }),
    });
    if (res.ok) { toast.success(supplier.active ? "Deactivated" : "Activated"); onRefresh(); }
    else toast.error("Failed to update");
  }

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${supplier.active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <input
                value={name} onChange={(e) => setName(e.target.value)}
                className="w-full text-sm font-semibold border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700"
              />
              <input
                value={nickname} onChange={(e) => setNickname(e.target.value)}
                placeholder="Nickname (e.g. Abel)"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700"
              />
              <input
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="Main contact email"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700"
              />
              <input
                value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="Main contact phone"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700"
              />
              <input
                value={salesRep} onChange={(e) => setSalesRep(e.target.value)}
                placeholder="Sales rep name"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700"
              />
              <input
                value={pocName} onChange={(e) => setPocName(e.target.value)}
                placeholder="POC name (Point of Contact)"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700"
              />
              <input
                value={pocEmail} onChange={(e) => setPocEmail(e.target.value)}
                placeholder="POC email"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700"
              />
              <input
                value={pocPhone} onChange={(e) => setPocPhone(e.target.value)}
                placeholder="POC phone"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700"
              />
              <input
                value={address} onChange={(e) => setAddress(e.target.value)}
                placeholder="Address"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700"
              />
              <input
                value={comments} onChange={(e) => setComments(e.target.value)}
                placeholder="Comments (e.g. FP Exclusives)"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700"
              />
              <div className="flex gap-2">
                <button onClick={save} disabled={saving}
                  className="text-xs bg-gray-900 text-white px-3 py-1 rounded hover:bg-gray-700 disabled:opacity-50">
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => {
                  setEditing(false);
                  setName(supplier.name);
                  setNickname(supplier.nickname ?? "");
                  setEmail(supplier.contactEmail ?? "");
                  setPhone(supplier.contactPhone ?? "");
                  setPocName(supplier.pocName ?? "");
                  setPocEmail(supplier.pocEmail ?? "");
                  setPocPhone(supplier.pocPhone ?? "");
                  setSalesRep(supplier.salesRepName ?? "");
                  setAddress(supplier.address ?? "");
                  setComments(supplier.comments ?? "");
                }}
                  className="text-xs text-gray-500 hover:text-gray-700">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-gray-900">{supplier.name}</span>
                {supplier.nickname && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{supplier.nickname}</span>
                )}
                {!supplier.active && (
                  <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Inactive</span>
                )}
              </div>
              <div className="space-y-1 mt-1 text-xs text-gray-600">
                {supplier.contactEmail && (
                  <p>📧 {supplier.contactEmail}</p>
                )}
                {supplier.contactPhone && (
                  <p>📱 {supplier.contactPhone}</p>
                )}
                {supplier.salesRepName && (
                  <p>👤 Sales Rep: {supplier.salesRepName}</p>
                )}
                {supplier.pocName && (
                  <p>👥 POC: {supplier.pocName}</p>
                )}
                {supplier.pocEmail && (
                  <p>💬 {supplier.pocEmail}</p>
                )}
                {supplier.pocPhone && (
                  <p>☎️ {supplier.pocPhone}</p>
                )}
                {supplier.address && (
                  <p>📍 {supplier.address}</p>
                )}
              </div>
              {supplier.comments && (
                <p className="text-xs text-gray-400 mt-2">{supplier.comments}</p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href={`/orders?supplierId=${supplier.id}`}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {supplier.orderCount} order{supplier.orderCount !== 1 ? "s" : ""} ↗
          </Link>
          <button
            onClick={viewAsSupplier}
            disabled={impersonating}
            className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
          >
            {impersonating ? "Loading…" : "View as supplier ↗"}
          </button>
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-xs text-gray-500 hover:text-gray-700">
              Edit
            </button>
          )}
          <button onClick={toggleActive}
            className={`text-xs ${supplier.active ? "text-gray-400 hover:text-red-600" : "text-gray-400 hover:text-green-600"}`}>
            {supplier.active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>

      {/* Lead time fields */}
      <div className="pt-2 border-t border-gray-100 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead Times</p>
        <div className="flex items-end gap-3 flex-wrap">
          <InlineNumber
            label="Test Print TAT (days)"
            value={supplier.testPrintTat}
            onSave={(v) => saveCapacityField("testPrintTat", v)}
          />
          <InlineNumber
            label="Production Time (days)"
            value={supplier.productionTime}
            onSave={(v) => saveCapacityField("productionTime", v)}
          />
          <InlineNumber
            label="Shipping Time — Air (days)"
            value={supplier.shippingTimeAir}
            onSave={(v) => saveCapacityField("shippingTimeAir", v)}
          />
          <InlineNumber
            label="Shipping Time — Sea (days)"
            value={supplier.shippingTimeSea}
            onSave={(v) => saveCapacityField("shippingTimeSea", v)}
          />
        </div>
        {/* Computed totals */}
        {((supplier.testPrintTat ?? 0) + (supplier.productionTime ?? 0)) > 0 && (
          <div className="flex gap-4 text-xs text-gray-500 mt-1">
            {supplier.shippingTimeAir != null && (
              <span>Total (Air): <span className="font-semibold text-gray-800">{(supplier.testPrintTat ?? 0) + (supplier.productionTime ?? 0) + supplier.shippingTimeAir} days</span></span>
            )}
            {supplier.shippingTimeSea != null && (
              <span>Total (Sea): <span className="font-semibold text-gray-800">{(supplier.testPrintTat ?? 0) + (supplier.productionTime ?? 0) + supplier.shippingTimeSea} days</span></span>
            )}
          </div>
        )}
      </div>

      {/* Capacity */}
      <div className="flex items-end gap-4 pt-1 border-t border-gray-100">
        <InlineNumber
          label="Capacity (orders/day)"
          value={supplier.capacityUnits}
          onSave={(v) => saveCapacityField("capacityUnits", v)}
        />
      </div>

      {/* POC */}
      <div className="pt-2 border-t border-gray-100 flex items-center gap-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">POC Assigned</span>
        <select
          value={supplier.pocUserId ?? ""}
          onChange={async (e) => {
            const val = e.target.value ? parseInt(e.target.value) : null;
            const res = await fetch(`/api/suppliers/${supplier.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pocUserId: val }),
            });
            if (res.ok) { toast.success("POC updated"); onRefresh(); }
            else toast.error("Failed to update POC");
          }}
          className="text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700 bg-white"
        >
          <option value="">— Unassigned —</option>
          {internalUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>

      {/* Logins */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Portal Logins</p>
        {supplier.users.length === 0 ? (
          <p className="text-xs text-gray-400">No logins yet.</p>
        ) : (
          <ul className="space-y-1">
            {supplier.users.map((u) => (
              <li key={u.id} className="text-xs text-gray-700">
                <span className="font-medium">{u.name}</span>{" "}
                <span className="text-gray-400">({u.email})</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2">
          <AddUserForm supplierId={supplier.id} onSaved={onRefresh} />
        </div>
      </div>
    </div>
  );
}

export function SuppliersManager() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [internalUsers, setInternalUsers] = useState<InternalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/suppliers");
    if (res.ok) {
      const data = await res.json();
      setSuppliers(data.suppliers ?? []);
      setInternalUsers(data.internalUsers ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createSupplier(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, contactEmail: newEmail }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Supplier added");
      setAdding(false); setNewName(""); setNewEmail("");
      load();
    } else toast.error("Failed to add supplier");
  }

  const active = suppliers.filter((s) => s.active);
  const inactive = suppliers.filter((s) => !s.active);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Suppliers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{active.length} active manufacturer{active.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
        >
          + Add supplier
        </button>
      </div>

      {adding && (
        <form onSubmit={createSupplier} className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900">New Supplier</p>
          <input
            value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Supplier name" required
            className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-gray-700"
          />
          <input
            value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Contact email (optional)"
            className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-gray-700"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="text-sm bg-gray-900 text-white px-4 py-1.5 rounded hover:bg-gray-700 disabled:opacity-50">
              {saving ? "Adding…" : "Add"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : (
        <div className="space-y-3">
          {active.map((s) => <SupplierRow key={s.id} supplier={s} onRefresh={load} internalUsers={internalUsers} />)}
          {inactive.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 pt-2">Inactive</p>
              {inactive.map((s) => <SupplierRow key={s.id} supplier={s} onRefresh={load} internalUsers={internalUsers} />)}
            </>
          )}
          {suppliers.length === 0 && (
            <p className="text-sm text-gray-400 py-8 text-center">No suppliers yet. Add one or import a CSV.</p>
          )}
        </div>
      )}
    </div>
  );
}
