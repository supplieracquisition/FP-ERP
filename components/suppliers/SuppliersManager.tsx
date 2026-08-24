"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";

type SupplierUser = { id: number; name: string; email: string };
type InternalUser = { id: number; name: string };

/**
 * The create form's fields, all held as strings — a number input's value is a
 * string, and "" has to stay distinguishable from 0 so a blank box saves as
 * "not known yet" rather than a real capacity of zero. The API coerces.
 */
type SupplierForm = {
  name: string;
  contactEmail: string;
  testPrintTat: string;
  productionTime: string;
  shippingTimeSea: string;
  shippingTimeAir: string;
  capacityUnits: string;
  pocUserId: string;
  loginName: string;
  loginEmail: string;
};

const BLANK_SUPPLIER_FORM: SupplierForm = {
  name: "",
  contactEmail: "",
  testPrintTat: "",
  productionTime: "",
  shippingTimeSea: "",
  shippingTimeAir: "",
  capacityUnits: "",
  pocUserId: "",
  loginName: "",
  loginEmail: "",
};

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

/**
 * Invite a supplier portal login.
 *
 * Two presentations, one mechanism. A supplier with no login yet gets the
 * prominent call to action: records are deliberately creatable without a login
 * (the create form's login fields are optional), so attaching one later is the
 * expected next step rather than an edge case.
 *
 * A supplier that already has a login gets a quiet secondary link instead. A
 * second contact at the same factory — sampling and production, say — is
 * supported on purpose: users.supplier_id is many-to-one and this section lists
 * logins as a set. It is just not the common path, so it does not compete with
 * the rest of the row.
 *
 * Both branches send the identical request. The only uniqueness rule is on the
 * email itself, enforced server-side by inviteSupplierUser.
 */
function AddUserForm({ supplierId, hasLogins, onSaved }: {
  supplierId: number;
  hasLogins: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // No password field: the supplier sets their own from the invite email. One
  // set here would have been discarded anyway — accounts are Supabase Auth
  // accounts, and nothing in this app stores a password.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/suppliers/${supplierId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userEmail: email, userName: name }),
    });
    setSaving(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(d.invited === false ? "Local dev login created" : `Invite sent to ${email}`);
      setOpen(false);
      setEmail(""); setName("");
      onSaved();
    } else {
      toast.error(d.error ?? "Failed to send invite");
    }
  }

  if (!open) {
    return hasLogins ? (
      <button onClick={() => setOpen(true)} className="text-xs text-blue-600 hover:text-blue-800">
        + Add another login
      </button>
    ) : (
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-gray-900 text-white px-3 py-1 rounded hover:bg-gray-700 transition-colors"
      >
        Invite to portal
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 p-3 bg-gray-50 rounded-md border border-gray-200">
      <p className="text-xs font-semibold text-gray-700">
        {hasLogins ? "Add another login" : "Invite to portal"}
      </p>
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
      <p className="text-xs text-gray-500">
        They&apos;ll get an email to set their own password.
      </p>
      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="text-xs bg-gray-900 text-white px-3 py-1 rounded hover:bg-gray-700 disabled:opacity-50">
          {saving ? "Sending…" : "Send invite"}
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

/**
 * A plain labelled number box for the create form.
 *
 * Distinct from InlineNumber, which saves each field on its own as you leave it
 * — the right behaviour for editing a supplier that already exists, and the
 * wrong one for a supplier that has no id yet. Here the whole form submits at
 * once.
 */
function FormNumber({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500 font-medium">{label}</label>
      <input
        type="number" min="0" step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700 bg-white tabular-nums"
      />
    </div>
  );
}

function SupplierRow({ supplier, onRefresh, internalUsers, canReassignPoc }: {
  supplier: Supplier;
  onRefresh: () => void;
  internalUsers: InternalUser[];
  canReassignPoc: boolean;
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
          disabled={!canReassignPoc}
          title={canReassignPoc ? undefined : "Only an admin can change a supplier's POC"}
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
          className="text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700 bg-white disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
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
          <AddUserForm
            supplierId={supplier.id}
            hasLogins={supplier.users.length > 0}
            onSaved={onRefresh}
          />
        </div>
      </div>
    </div>
  );
}

export function SuppliersManager({ userRole }: { userRole: string }) {
  const isAdmin = userRole === "admin";
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [internalUsers, setInternalUsers] = useState<InternalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(BLANK_SUPPLIER_FORM);

  const setField = (field: keyof SupplierForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

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
      body: JSON.stringify({
        name: form.name,
        contactEmail: form.contactEmail,
        testPrintTat: form.testPrintTat,
        productionTime: form.productionTime,
        shippingTimeSea: form.shippingTimeSea,
        shippingTimeAir: form.shippingTimeAir,
        capacityUnits: form.capacityUnits,
        pocUserId: form.pocUserId,
        loginName: form.loginName,
        loginEmail: form.loginEmail,
      }),
    });
    setSaving(false);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(data.error ?? "Failed to add supplier");
      return;
    }

    // The supplier is saved either way. A failed invite is reported without
    // discarding the record, so the admin retries the invite alone rather than
    // re-entering every field.
    if (data.invite && !data.invite.ok) {
      toast.error(`Supplier added, but the invite failed: ${data.invite.error}`, { duration: 10000 });
    } else if (data.invite?.ok) {
      toast.success(
        data.invite.invited === false
          ? "Supplier added with a local dev login"
          : `Supplier added — invite sent to ${form.loginEmail}`
      );
    } else {
      toast.success("Supplier added");
    }

    setAdding(false);
    setForm(BLANK_SUPPLIER_FORM);
    load();
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
        <form onSubmit={createSupplier} className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-4">
          <p className="text-sm font-semibold text-gray-900">New Supplier</p>

          <div className="space-y-2">
            <input
              value={form.name} onChange={(e) => setField("name", e.target.value)}
              placeholder="Supplier name" required
              className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-gray-700 bg-white"
            />
            <input
              type="email"
              value={form.contactEmail} onChange={(e) => setField("contactEmail", e.target.value)}
              placeholder="Contact email (optional)"
              className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-gray-700 bg-white"
            />
          </div>

          <div className="pt-3 border-t border-blue-200 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead Times & Capacity</p>
            <div className="grid grid-cols-2 gap-3">
              <FormNumber
                label="Test print (days)" value={form.testPrintTat}
                onChange={(v) => setField("testPrintTat", v)}
              />
              <FormNumber
                label="Production time (days)" value={form.productionTime}
                onChange={(v) => setField("productionTime", v)}
              />
              <FormNumber
                label="Shipping — sea (days)" value={form.shippingTimeSea}
                onChange={(v) => setField("shippingTimeSea", v)}
              />
              <FormNumber
                label="Shipping — air (days)" value={form.shippingTimeAir}
                onChange={(v) => setField("shippingTimeAir", v)}
              />
              <FormNumber
                label="Order capacity (orders/day)" value={form.capacityUnits}
                onChange={(v) => setField("capacityUnits", v)}
              />
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-gray-500 font-medium">POC</label>
                <select
                  value={form.pocUserId}
                  onChange={(e) => setField("pocUserId", e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700 bg-white"
                >
                  <option value="">— Unassigned —</option>
                  {internalUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-400">Leave blank if not known yet — all editable later.</p>
          </div>

          <div className="pt-3 border-t border-blue-200 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Portal Login (optional)</p>
            <input
              value={form.loginName} onChange={(e) => setField("loginName", e.target.value)}
              placeholder="Contact person's name"
              className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-gray-700 bg-white"
            />
            <input
              type="email"
              value={form.loginEmail} onChange={(e) => setField("loginEmail", e.target.value)}
              placeholder="Login email — sends an invite"
              className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-gray-700 bg-white"
            />
            <p className="text-xs text-gray-400">
              Leave blank to register the supplier now and invite someone later. If filled in, they
              get an email to set their own password.
            </p>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="text-sm bg-gray-900 text-white px-4 py-1.5 rounded hover:bg-gray-700 disabled:opacity-50">
              {saving ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setForm(BLANK_SUPPLIER_FORM); }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : (
        <div className="space-y-3">
          {active.map((s) => <SupplierRow key={s.id} supplier={s} onRefresh={load} internalUsers={internalUsers} canReassignPoc={isAdmin} />)}
          {inactive.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 pt-2">Inactive</p>
              {inactive.map((s) => <SupplierRow key={s.id} supplier={s} onRefresh={load} internalUsers={internalUsers} canReassignPoc={isAdmin} />)}
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
