"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";

type ImportResult = {
  importId: number;
  successCount: number;
  errorCount: number;
  total: number;
};

export function CsvImport({ userRole }: { userRole?: string }) {
  // Both clear paths call DELETE /api/orders, which is admin-only. Hiding them
  // for everyone else beats showing a control that 403s — the "clear first"
  // one would otherwise fail an import partway through.
  const isAdmin = userRole === "admin";
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [clearFirst, setClearFirst] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    if (!f.name.endsWith(".csv")) {
      toast.error("Please select a CSV file");
      return;
    }
    setFile(f);
    setResult(null);
  }

  async function clearAllOrders() {
    setClearing(true);
    const res = await fetch("/api/orders", { method: "DELETE" });
    setClearing(false);
    setConfirmClear(false);
    if (res.ok) toast.success("All orders cleared");
    else toast.error("Failed to clear orders");
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);

    // Optionally clear first
    if (clearFirst) {
      const clearRes = await fetch("/api/orders", { method: "DELETE" });
      if (!clearRes.ok) {
        toast.error("Failed to clear existing orders");
        setLoading(false);
        return;
      }
    }

    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/import", { method: "POST", body: form });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      toast.error(data.error ?? "Import failed");
      return;
    }

    setResult(data);
    if (data.errorCount === 0) toast.success(`Imported ${data.successCount} order items`);
    else toast.warning(`${data.successCount} imported, ${data.errorCount} errors`);
  }

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-8 py-14 text-center transition-colors ${
          dragging
            ? "border-gray-900 bg-gray-100"
            : file
            ? "border-green-400 bg-green-50"
            : "border-gray-300 hover:border-gray-400 bg-white"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {file ? (
          <div>
            <div className="text-lg font-medium text-gray-900">📄 {file.name}</div>
            <div className="text-sm text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</div>
          </div>
        ) : (
          <div>
            <div className="text-3xl text-gray-300 mb-3">↑</div>
            <div className="text-sm font-medium text-gray-700">Drop your CSV file here, or click to browse</div>
            <div className="text-xs text-gray-400 mt-1">MTO Orders CSV export</div>
          </div>
        )}
      </div>

      {/* Options */}
      {file && !result && isAdmin && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={clearFirst}
              onChange={(e) => setClearFirst(e.target.checked)}
              className="mt-0.5 rounded"
            />
            <div>
              <div className="text-sm font-medium text-gray-800">Clear existing orders before importing</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Removes all current orders, statuses, and comments. Use this when uploading a fresh export.
              </div>
            </div>
          </label>
        </div>
      )}

      {/* Import notes */}
      {file && !result && !clearFirst && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
          <strong>Update mode:</strong> Existing order items are updated (order data refreshed, status preserved). New items are created with status "New".
        </div>
      )}
      {file && !result && clearFirst && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <strong>Replace mode:</strong> All existing orders, statuses, and comments will be permanently deleted before importing.
        </div>
      )}

      {/* Import button */}
      {file && !result && (
        <button
          onClick={handleImport}
          disabled={loading}
          className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {loading
            ? clearFirst
              ? "Clearing then importing…"
              : "Importing…"
            : clearFirst
            ? "Clear & Import"
            : "Import Orders"}
        </button>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-900">Import Complete</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-2xl font-bold text-gray-900">{result.total}</div>
              <div className="text-xs text-gray-500 mt-0.5">Total rows</div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="text-2xl font-bold text-green-700">{result.successCount}</div>
              <div className="text-xs text-gray-500 mt-0.5">Imported</div>
            </div>
            <div className={`rounded-lg p-3 ${result.errorCount > 0 ? "bg-red-50" : "bg-gray-50"}`}>
              <div className={`text-2xl font-bold ${result.errorCount > 0 ? "text-red-600" : "text-gray-400"}`}>
                {result.errorCount}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">Errors</div>
            </div>
          </div>
          <div className="flex gap-3">
            <a
              href="/orders"
              className="flex-1 rounded-md bg-gray-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-gray-700 transition-colors"
            >
              View Orders
            </a>
            <button
              onClick={() => { setFile(null); setResult(null); setClearFirst(false); }}
              className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Import Another
            </button>
          </div>
        </div>
      )}

      {/* Danger zone */}
      {isAdmin && (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <h3 className="text-sm font-semibold text-red-800 mb-1">Danger Zone</h3>
        <p className="text-xs text-red-700 mb-3">
          Permanently delete all order data including statuses, comments, and import history. This cannot be undone.
        </p>
        {!confirmClear ? (
          <button
            onClick={() => setConfirmClear(true)}
            className="text-xs font-medium text-red-600 border border-red-300 rounded px-3 py-1.5 hover:bg-red-100 transition-colors"
          >
            Clear all orders…
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-red-700 font-medium">This will delete everything. Continue?</span>
            <button
              onClick={clearAllOrders}
              disabled={clearing}
              className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {clearing ? "Clearing…" : "Yes, delete all"}
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="text-xs text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
