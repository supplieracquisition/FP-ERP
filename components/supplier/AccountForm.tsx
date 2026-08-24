"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  SUPPLIER_EDITABLE_FIELDS,
  SUPPLIER_FIELD_LABELS,
  type SupplierEditableField,
} from "@/lib/supplierEditable";

export type EditableValues = Record<SupplierEditableField, string>;

export interface OperationalValues {
  testPrintTat: number | null;
  productionTime: number | null;
  shippingTimeSea: number | null;
  shippingTimeAir: number | null;
  capacityUnits: number | null;
  turnTime: number | null;
}

const INPUT =
  "w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700 disabled:bg-gray-50 disabled:text-gray-500";

const days = (n: number | null) => (n === null ? "—" : `${n} day${n === 1 ? "" : "s"}`);

export default function AccountForm({
  initial,
  operational,
  signInEmail,
}: {
  initial: EditableValues;
  operational: OperationalValues;
  signInEmail: string;
}) {
  const [values, setValues] = useState<EditableValues>(initial);
  const [saved, setSaved] = useState<EditableValues>(initial);
  const [saving, setSaving] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const dirty = SUPPLIER_EDITABLE_FIELDS.some((f) => values[f] !== saved[f]);

  const set = (field: SupplierEditableField, v: string) =>
    setValues((prev) => ({ ...prev, [field]: v }));

  async function save() {
    setSaving(true);
    try {
      // Only changed fields are sent. The server rejects any key outside its
      // allowlist, so the body must never be widened to the whole form state.
      const patch: Partial<EditableValues> = {};
      for (const f of SUPPLIER_EDITABLE_FIELDS) {
        if (values[f] !== saved[f]) patch[f] = values[f];
      }

      const res = await fetch("/api/supplier/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Could not save your changes");
        return;
      }

      setSaved(values);
      toast.success(
        data.notified === false
          ? "Saved — but we could not email your Fresh Prints contact"
          : "Saved. Your Fresh Prints contact has been notified."
      );
    } catch {
      toast.error("Could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  const field = (f: SupplierEditableField, type = "text") => (
    <div key={f}>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {SUPPLIER_FIELD_LABELS[f]}
      </label>
      <input
        type={type}
        value={values[f]}
        disabled={saving}
        onChange={(e) => set(f, e.target.value)}
        className={INPUT}
      />
    </div>
  );

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Group A */}
      <section className="border border-gray-200 rounded-lg bg-white">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-bold text-gray-900">Your details</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            You can edit these. Saving notifies your Fresh Prints contact.
          </p>
        </div>

        <div className="p-5 space-y-4">
          {field("name")}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field("contactEmail", "email")}
            {field("contactPhone", "tel")}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
            <textarea
              value={values.address}
              disabled={saving}
              onChange={(e) => set("address", e.target.value)}
              rows={3}
              className={INPUT}
            />
          </div>

          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-700 mb-3">Main contact person</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {field("pocName")}
              {field("pocEmail", "email")}
              {field("pocPhone", "tel")}
            </div>
          </div>

          <div className="pt-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Sign-in email
            </label>
            <input value={signInEmail} disabled className={INPUT} />
            <p className="text-xs text-gray-400 mt-1">
              This is the address you log in with. Contact Fresh Prints to change it.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="text-xs font-semibold bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-700 disabled:bg-gray-300 transition-colors"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </section>

      {/* Group B */}
      <section className="border border-gray-200 rounded-lg bg-white">
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Operational settings</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Set by Fresh Prints. Ask us if any of these need to change.
            </p>
          </div>
          <button
            onClick={() => setRequestOpen(true)}
            className="shrink-0 text-xs font-semibold border border-gray-300 rounded px-3 py-2 hover:bg-gray-50 transition-colors"
          >
            Request a change
          </button>
        </div>

        <dl className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
          {[
            ["Test print turnaround", days(operational.testPrintTat)],
            ["Production time", days(operational.productionTime)],
            ["Shipping time (sea)", days(operational.shippingTimeSea)],
            ["Shipping time (air)", days(operational.shippingTimeAir)],
            [
              "Capacity",
              operational.capacityUnits === null
                ? "—"
                : `${operational.capacityUnits.toLocaleString()} units`,
            ],
            ["Turn time", days(operational.turnTime)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className="text-sm font-medium text-gray-900 mt-0.5">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {requestOpen && <ChangeRequestModal onClose={() => setRequestOpen(false)} />}
    </div>
  );
}

function ChangeRequestModal({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/supplier/change-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Could not send your request");
        return;
      }

      toast.success("Request sent to Fresh Prints");
      onClose();
    } catch {
      toast.error("Could not reach the server");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-gray-900">Request a change</h2>
            <button
              onClick={onClose}
              disabled={sending}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <p className="text-xs text-gray-500">
            Tell us which setting should change and why. This goes to the Fresh Prints
            logistics team and your account contact — nothing changes until they approve it.
          </p>

          <textarea
            autoFocus
            value={message}
            disabled={sending}
            maxLength={4000}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder="e.g. We can now turn test prints around in 2 days instead of 4."
            className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-gray-700"
          />

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={sending}
              className="text-xs font-semibold text-gray-600 px-3 py-2 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={sending || !message.trim()}
              className="text-xs font-semibold bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-700 disabled:bg-gray-300 transition-colors"
            >
              {sending ? "Sending…" : "Send request"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
