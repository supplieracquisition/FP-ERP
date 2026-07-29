"use client";

import { useState, useEffect } from "react";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    const res = await fetch("/api/admin/api-keys");
    const data = await res.json();
    setKeys(data.keys || []);
  }

  async function createKey() {
    if (!newKeyName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      const data = await res.json();
      if (data.key) {
        setCreatedKey(data.key);
        setNewKeyName("");
        await fetchKeys();
      }
    } finally {
      setLoading(false);
    }
  }

  async function deleteKey(id: number) {
    if (!confirm("Delete this API key?")) return;
    await fetch("/api/admin/api-keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyId: id }),
    });
    await fetchKeys();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">API Keys</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage keys for automated integrations (n8n, webhooks, etc.)</p>
      </div>

      {createdKey && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-green-900 mb-2">✓ API Key Created</p>
          <p className="text-xs text-green-700 mb-3">Save this now — you won't see it again:</p>
          <code className="block bg-white border border-green-200 rounded px-3 py-2 text-xs font-mono text-green-900 overflow-auto mb-3 break-all">
            {createdKey}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(createdKey);
              alert("Copied!");
            }}
            className="text-xs text-green-700 hover:text-green-900 font-medium"
          >
            Copy to Clipboard
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <label className="block text-xs font-medium text-gray-700 mb-2">Create New Key</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createKey()}
            placeholder="e.g., n8n-hourly-import"
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-700"
          />
          <button
            onClick={createKey}
            disabled={loading || !newKeyName.trim()}
            className="rounded bg-gray-900 text-white px-4 py-2 text-sm font-semibold hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create"}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Created</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Last Used</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900 font-medium">{key.name}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {key.createdAt ? new Date(key.createdAt).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => deleteKey(key.id)}
                    className="text-xs text-red-600 hover:text-red-900 font-medium"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {keys.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-500">No API keys yet</div>
        )}
      </div>
    </div>
  );
}
