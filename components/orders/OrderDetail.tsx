"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";

type Supplier = { id: number; name: string };

const COLUMN_OPTIONS = [
  { value: "sample_production", label: "Sample Production" },
  { value: "fabric_sourcing",   label: "Fabric Sourcing / Cutting" },
  { value: "printing",          label: "Printing" },
  { value: "assembly",          label: "Assembly" },
  { value: "qa_packing",        label: "QA + Packing" },
  { value: "shipped",           label: "Shipped" },
  { value: "completed",         label: "Delivered" },
];

const DELAY_REASONS = [
  "Client delay",
  "Fresh Prints delay",
  "Supplier delay",
  "Printing delay",
  "Shipping delay",
];

function effectiveColumn(status: string, productionStage: string | null): string {
  if (status === "shipped")   return "shipped";
  if (status === "completed") return "completed";
  return productionStage ?? "sample_production";
}

type OrderImage = {
  id: number;
  type: string;
  filePath: string;
  fileName: string;
  createdAt: string;
};

type OrderData = {
  orderItemId: string;
  orderId: string;
  orderName: string | null;
  orderCreatedAt: string | null;
  styleCode: string | null;
  color: string | null;
  templatePdf: string | null;
  printerShipDate: string | null;
  originalPrinterShipDate: string | null;
  supplierShipDate: string | null;
  delayReason: string | null;
  testPrintStatus: string | null;
  testPrintRejections: number;
  shippingMethod: string | null;
  requiresTestPrint: boolean;
  printType: string | null;
  printLocations: number | null;
  decoratingMethods: string | null;
  dueDate: string | null;
  inHandsDate: string | null;
  testPrintDate: string | null;
  totalValue: number | null;
  quantity: number | null;
  status: string;
  productionStage: string | null;
  trackingNumber: string | null;
  updatedAt: string;
  supplierId: number | null;
  supplierName: string | null;
  supplierNickname: string | null;
  nominatedSupplierId: number | null;
  statusHistory: {
    id: number;
    fromStatus: string | null;
    toStatus: string;
    changedAt: string;
    note: string | null;
    changedByName: string | null;
  }[];
  comments: {
    id: number;
    body: string;
    isInternal: boolean;
    createdAt: string;
    userName: string | null;
    userRole: string | null;
  }[];
};

function ImageUpload({ orderItemId, type, label, onUploaded }: {
  orderItemId: string; type: string; label: string; onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", files[0]);
    fd.append("type", type);
    const res = await fetch(`/api/orders/${orderItemId}/images`, { method: "POST", body: fd });
    setUploading(false);
    if (res.ok) { toast.success(`${label} uploaded`); onUploaded(); }
    else { const d = await res.json().catch(() => ({})); toast.error(d.error ?? "Upload failed"); }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => upload(e.target.files)} />
      <button onClick={() => inputRef.current?.click()} disabled={uploading}
        className="text-xs border border-dashed border-gray-300 rounded px-3 py-1.5 text-gray-500 hover:border-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors">
        {uploading ? "Uploading…" : `+ Upload ${label}`}
      </button>
    </div>
  );
}

function ReportIssueForm({ orderItemId, isSupplier, onSubmitted }: {
  orderItemId: string; isSupplier: boolean; onSubmitted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!issue.trim()) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.append("issue", issue);
    if (requestedDate) fd.append("requestedShipDate", requestedDate);
    if (files) Array.from(files).forEach((f) => fd.append("images", f));
    const res = await fetch(`/api/orders/${orderItemId}/report`, { method: "POST", body: fd });
    setSubmitting(false);
    if (res.ok) {
      toast.success("Issue reported and email sent to logistics");
      setOpen(false); setIssue(""); setRequestedDate(""); setFiles(null);
      onSubmitted();
    } else toast.error("Failed to submit issue");
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="w-full rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors font-medium">
      🚨 Report an Issue
    </button>
  );

  return (
    <form onSubmit={submit} className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
      <p className="text-sm font-semibold text-red-800">Report an Issue</p>
      <textarea value={issue} onChange={(e) => setIssue(e.target.value)}
        placeholder="Describe the issue…" rows={4} required
        className="w-full text-sm border border-red-200 rounded px-3 py-2 focus:outline-none focus:border-red-400 resize-none bg-white" />
      <div>
        <label className="text-xs text-gray-600 block mb-1">Request new ship date (optional)</label>
        <input type="date" value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)}
          className="text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-gray-700 w-full" />
      </div>
      <div>
        <label className="text-xs text-gray-600 block mb-1">Attach images (optional)</label>
        <input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)}
          className="text-xs text-gray-600" />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting || !issue.trim()}
          className="text-sm bg-red-600 text-white px-4 py-1.5 rounded hover:bg-red-700 disabled:opacity-50">
          {submitting ? "Sending…" : "Send to Logistics"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </form>
  );
}

function StyleIcon({ styleCode, color }: { styleCode: string | null; color: string | null }) {
  if (!styleCode) return null;
  const style = styleCode.toLowerCase().replace(/\s+/g, "");
  const src = `/api/icon?style=${encodeURIComponent(style)}&color=${encodeURIComponent(color ?? "")}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={styleCode} width={64} height={64}
      className="rounded-lg border border-gray-100 object-contain bg-white p-1 shadow-sm w-16 h-16"
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
  );
}

function PdfThumbnail({ templatePdf }: { templatePdf: string }) {
  const url = `/api/pdf-proxy?file=${encodeURIComponent(templatePdf)}`;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        const pdf = await pdfjsLib.getDocument({ url, cMapUrl: undefined }).promise;
        const page = await pdf.getPage(1);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const viewport = page.getViewport({ scale: 1.8 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (!cancelled) setState("done");
      } catch {
        if (!cancelled) setState("error");
      }
    }
    render();
    return () => { cancelled = true; };
  }, [url]);

  return (
    <div className="mt-1">
      <div className="rounded-lg border border-gray-200 overflow-hidden shadow-sm bg-gray-50">
        {state === "loading" && (
          <div className="h-48 flex items-center justify-center text-xs text-gray-400">
            Loading preview…
          </div>
        )}
        {state === "error" && (
          <div className="h-24 flex items-center justify-center text-xs text-gray-400">
            Preview unavailable
          </div>
        )}
        <canvas ref={canvasRef}
          className="w-full"
          style={{ display: state === "done" ? "block" : "none" }} />
      </div>
    </div>
  );
}

export function OrderDetail({ orderItemId, suppliers, userRole }: {
  orderItemId: string; suppliers: Supplier[]; userRole: string;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [images, setImages] = useState<OrderImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState("");
  const [isInternalComment, setIsInternalComment] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editShipDate, setEditShipDate] = useState(false);
  const [newShipDate, setNewShipDate] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [editingField, setEditingField] = useState<"supplierShipDate" | "inHandsDate" | "testPrintDate" | null>(null);
  const [editValue, setEditValue] = useState("");

  const fmt = (d: string | null) => d ? format(new Date(d), "MMM d, yyyy") : "—";
  const fmtFull = (d: string | null) => d ? format(new Date(d), "MMM d, yyyy h:mm a") : "—";

  const isAdmin = userRole === "admin";
  const isInternalUser = userRole === "admin" || userRole === "internal";
  const isSupplier = userRole === "supplier";

  async function load() {
    const [orderRes, imagesRes] = await Promise.all([
      fetch(`/api/orders/${orderItemId}`),
      fetch(`/api/orders/${orderItemId}/images`),
    ]);
    if (!orderRes.ok) return;
    setOrder(await orderRes.json());
    if (imagesRes.ok) setImages(await imagesRes.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [orderItemId]);

  async function updateColumn(column: string) {
    // Validate: only orders requiring test print can move to sample_production
    if (column === "sample_production" && !order?.requiresTestPrint) {
      toast.error("Only orders requiring test print can move to Sample Production");
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/orders/${orderItemId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ column }),
    });
    setSaving(false);
    if (res.ok) { toast.success("Stage updated"); load(); }
    else toast.error("Failed to update stage");
  }

  async function updateSupplier(supplierId: string) {
    setSaving(true);
    const res = await fetch(`/api/orders/${orderItemId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId: supplierId ? parseInt(supplierId) : null }),
    });
    setSaving(false);
    if (res.ok) { toast.success("Manufacturer updated"); load(); }
    else toast.error("Failed to update manufacturer");
  }

  async function saveDateEdit(field: "supplierShipDate" | "inHandsDate" | "testPrintDate") {
    setSaving(true);
    const payload: Record<string, unknown> = {};
    payload[field] = editValue ? new Date(editValue).toISOString() : null;

    const res = await fetch(`/api/orders/${orderItemId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(`${field.replace(/([A-Z])/g, ' $1')} updated`);
      setEditingField(null);
      load();
    }
    else toast.error("Failed to update date");
  }

  function startEditDate(field: "supplierShipDate" | "inHandsDate" | "testPrintDate") {
    setEditingField(field);
    const currentValue = order?.[field];
    setEditValue(currentValue ? currentValue.slice(0, 10) : "");
  }

  async function saveShipDate() {
    if (!newShipDate) return;
    const isMovedLater = order?.printerShipDate && newShipDate > order.printerShipDate.slice(0, 10);
    if (isAdmin && isMovedLater && !delayReason) { toast.error("Please select a delay reason"); return; }
    setSaving(true);
    const res = await fetch(`/api/orders/${orderItemId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printerShipDate: new Date(newShipDate).toISOString(), delayReason }),
    });
    setSaving(false);
    if (res.ok) { toast.success("Ship date updated"); setEditShipDate(false); load(); }
    else toast.error("Failed to update ship date");
  }

  async function approveTestPrint(status: "approved" | "rejected") {
    if (status === "rejected") {
      const res = await fetch(`/api/orders/${orderItemId}/test-print`, { method: "POST" });
      const data = await res.json();
      if (res.ok) { toast.success(data.label ?? "Test print rejected"); load(); }
      else toast.error("Failed to reject test print");
      return;
    }
    const res = await fetch(`/api/orders/${orderItemId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testPrintStatus: "approved" }),
    });
    if (res.ok) { toast.success("Test print approved"); load(); }
    else toast.error("Failed to approve test print");
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    const res = await fetch(`/api/orders/${orderItemId}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: comment, isInternal: isInternalComment }),
    });
    if (res.ok) { setComment(""); setIsInternalComment(false); load(); }
    else toast.error("Failed to post comment");
  }

  async function deleteOrder() {
    const res = await fetch(`/api/orders/${orderItemId}`, { method: "DELETE" });
    if (res.ok) { toast.success("Order deleted"); router.push("/orders"); }
    else toast.error("Failed to delete order");
  }

  if (loading) return <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>;
  if (!order) return <div className="text-sm text-red-500 py-12 text-center">Order not found</div>;

  const currentColumn = effectiveColumn(order.status, order.productionStage);
  const shipDateChanged = order.originalPrinterShipDate &&
    order.printerShipDate &&
    order.originalPrinterShipDate !== order.printerShipDate;

  const testPrints = images.filter((i) => i.type === "test_print");
  const referenceImages = images.filter((i) => i.type === "reference");

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <Link href={isSupplier ? "/supplier/orders" : "/orders"}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← Back to orders
          </Link>
          {isInternalUser && (
            <div>
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)} className="text-xs text-red-500 hover:text-red-700">Delete order</button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">Are you sure?</span>
                  <button onClick={deleteOrder} className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700">Yes, delete</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-3 flex items-start gap-4 flex-wrap">
          <StyleIcon styleCode={order.styleCode} color={order.color} />
          <div>
          <h1 className="text-xl font-bold font-mono">{order.orderItemId}</h1>
          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-medium">
            {COLUMN_OPTIONS.find((c) => c.value === currentColumn)?.label ?? currentColumn}
          </span>
          {order.testPrintStatus === "needs_approval" && !isSupplier && (
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded font-semibold">
              🖨 TEST PRINT NEEDS APPROVAL
            </span>
          )}
          {saving && <span className="text-xs text-gray-400">Saving…</span>}
          </div>
        </div>
        {order.orderName && <p className="text-base font-semibold text-gray-800 mt-1">{order.orderName}</p>}
        <p className="text-sm text-gray-500 mt-0.5">Order {order.orderId} · Created {fmt(order.orderCreatedAt)}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Order Details */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">Order Details</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div><dt className="text-gray-500">Style Code</dt><dd className="font-medium text-gray-900 mt-0.5">{order.styleCode ?? "—"}</dd></div>
              <div><dt className="text-gray-500">Color</dt><dd className="font-medium text-gray-900 mt-0.5">{order.color ?? "—"}</dd></div>
              <div><dt className="text-gray-500">Units</dt><dd className="font-medium text-gray-900 mt-0.5">{order.quantity?.toLocaleString() ?? "—"}</dd></div>
              {isInternalUser && (
                <div>
                  <dt className="text-gray-500">Value</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">
                    {order.totalValue && order.totalValue > 0
                      ? `$${order.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                  </dd>
                </div>
              )}
              <div><dt className="text-gray-500">Print Type</dt><dd className="font-medium text-gray-900 mt-0.5">{order.printType ?? "—"}</dd></div>
              <div><dt className="text-gray-500">Print Locations</dt><dd className="font-medium text-gray-900 mt-0.5">{order.printLocations ?? "—"}</dd></div>
              <div><dt className="text-gray-500">Decorating Methods</dt><dd className="font-medium text-gray-900 mt-0.5">{order.decoratingMethods || "—"}</dd></div>
              <div>
                <dt className="text-gray-500">Fresh Prints Order Link</dt>
                <dd className="mt-0.5">
                  <a href={`https://v3.freshprints.com/dashboard/order/${order.orderId}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 underline">View Order {order.orderId} ↗</a>
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-gray-500">Template PDF</dt>
                <dd className="mt-0.5">
                  {order.templatePdf ? <PdfThumbnail templatePdf={order.templatePdf} /> : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Supplier Ship Date</dt>
                {editingField === "supplierShipDate" ? (
                  <dd className="mt-2 space-y-2">
                    <input type="date" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                      className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700 w-full" />
                    <div className="flex gap-2">
                      <button onClick={() => saveDateEdit("supplierShipDate")} disabled={saving}
                        className="text-xs bg-gray-900 text-white px-3 py-1 rounded hover:bg-gray-700 disabled:opacity-50">Save</button>
                      <button onClick={() => setEditingField(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                    </div>
                  </dd>
                ) : (
                  <dd className="font-medium text-gray-900 mt-0.5 flex items-center gap-2">
                    {fmt(order.supplierShipDate)}
                    {isInternalUser && (
                      <button onClick={() => startEditDate("supplierShipDate")}
                        className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                    )}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-gray-500">Shipping Method</dt>
                <dd className="mt-1 flex items-center gap-2">
                  {(["air", "sea"] as const).map((method) => (
                    <button key={method}
                      onClick={async () => {
                        const next = order.shippingMethod === method ? null : method;
                        const res = await fetch(`/api/orders/${orderItemId}`, {
                          method: "PATCH", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ shippingMethod: next }),
                        });
                        if (res.ok) load();
                        else toast.error("Failed to update shipping method");
                      }}
                      className={`text-sm px-3 py-1 rounded border font-medium transition-colors ${
                        order.shippingMethod === method
                          ? method === "air"
                            ? "bg-sky-500 border-sky-500 text-white"
                            : "bg-blue-700 border-blue-700 text-white"
                          : "border-gray-300 text-gray-500 hover:border-gray-500"
                      }`}>
                      {method === "air" ? "✈ Air" : "🚢 Sea"}
                    </button>
                  ))}
                  {!order.shippingMethod && <span className="text-sm text-gray-400">Not set</span>}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Test Print</dt>
                <dd className="mt-1 flex items-center gap-2">
                  {(["needs_test_print", "no_test_print"] as const).map((opt) => {
                    const active = opt === "needs_test_print" ? order.requiresTestPrint : !order.requiresTestPrint;
                    return (
                      <button key={opt}
                        disabled={!isInternalUser}
                        onClick={async () => {
                          if (!isInternalUser) return;
                          const next = opt === "needs_test_print";
                          if (next === order.requiresTestPrint) return;
                          const res = await fetch(`/api/orders/${orderItemId}`, {
                            method: "PATCH", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ requiresTestPrint: next }),
                          });
                          if (res.ok) load();
                          else toast.error("Failed to update");
                        }}
                        className={`text-sm px-3 py-1 rounded border font-medium transition-colors ${
                          active
                            ? opt === "needs_test_print"
                              ? "bg-amber-500 border-amber-500 text-white"
                              : "bg-gray-700 border-gray-700 text-white"
                            : "border-gray-300 text-gray-400 hover:border-gray-400"
                        } disabled:cursor-default`}>
                        {opt === "needs_test_print" ? "Needs Test Print" : "No Test Print"}
                      </button>
                    );
                  })}
                </dd>
              </div>
              {isInternalUser && <div><dt className="text-gray-500">Order Due Date</dt><dd className="font-medium text-gray-900 mt-0.5">{fmt(order.dueDate)}</dd></div>}
              <div>
                <dt className="text-gray-500">In-Hands Date</dt>
                {editingField === "inHandsDate" ? (
                  <dd className="mt-2 space-y-2">
                    <input type="date" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                      className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700 w-full" />
                    <div className="flex gap-2">
                      <button onClick={() => saveDateEdit("inHandsDate")} disabled={saving}
                        className="text-xs bg-gray-900 text-white px-3 py-1 rounded hover:bg-gray-700 disabled:opacity-50">Save</button>
                      <button onClick={() => setEditingField(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                    </div>
                  </dd>
                ) : (
                  <dd className="font-medium text-gray-900 mt-0.5 flex items-center gap-2">
                    {fmt(order.inHandsDate)}
                    {isInternalUser && (
                      <button onClick={() => startEditDate("inHandsDate")}
                        className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                    )}
                  </dd>
                )}
              </div>
              {isInternalUser && order.requiresTestPrint && (
                <div>
                  <dt className="text-gray-500">Test Print Date</dt>
                  {editingField === "testPrintDate" ? (
                    <dd className="mt-2 space-y-2">
                      <input type="date" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                        className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-700 w-full" />
                      <div className="flex gap-2">
                        <button onClick={() => saveDateEdit("testPrintDate")} disabled={saving}
                          className="text-xs bg-gray-900 text-white px-3 py-1 rounded hover:bg-gray-700 disabled:opacity-50">Save</button>
                        <button onClick={() => setEditingField(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                      </div>
                    </dd>
                  ) : (
                    <dd className="font-medium text-gray-900 mt-0.5 flex items-center gap-2">
                      {fmt(order.testPrintDate)}
                      {isInternalUser && (
                        <button onClick={() => startEditDate("testPrintDate")}
                          className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                      )}
                    </dd>
                  )}
                </div>
              )}
              {order.trackingNumber && (
                <div className="col-span-2">
                  <dt className="text-gray-500">Tracking #</dt>
                  <dd className="mt-0.5">
                    <a href={`https://www.ups.com/track?tracknum=${order.trackingNumber}`}
                      target="_blank" rel="noopener noreferrer"
                      className="font-mono font-medium text-blue-600 hover:text-blue-800 underline">
                      {order.trackingNumber} ↗
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Test Print Images */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Test Print Images</h2>
              {isSupplier && <ImageUpload orderItemId={orderItemId} type="test_print" label="Test Print" onUploaded={load} />}
            </div>
            {order.testPrintStatus === "needs_approval" && isInternalUser && (
              <div className="mb-3 rounded-md bg-orange-50 border border-orange-200 p-3 space-y-2">
                <p className="text-sm font-semibold text-orange-800">
                  Test print #{(order.testPrintRejections ?? 0) + 1} needs approval
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => approveTestPrint("approved")}
                    className="text-xs bg-green-600 text-white px-4 py-1.5 rounded font-semibold hover:bg-green-700 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => approveTestPrint("rejected")}
                    className="text-xs bg-red-600 text-white px-4 py-1.5 rounded font-semibold hover:bg-red-700 transition-colors"
                  >
                    Reject — wipe &amp; request re-upload
                  </button>
                </div>
              </div>
            )}
            {order.testPrintStatus === "approved" && (
              <div className="mb-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 font-semibold">✓ Test print approved</div>
            )}
            {order.testPrintStatus === "rejected" && (
              <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 font-semibold">✗ Test print rejected — new upload required</div>
            )}
            {testPrints.length === 0 ? (
              <p className="text-sm text-gray-400">No test print images yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {testPrints.map((img) => (
                  <a key={img.id} href={img.filePath} target="_blank" rel="noopener noreferrer">
                    <img src={img.filePath} alt={img.fileName}
                      className="w-full h-24 object-cover rounded border border-gray-200 hover:opacity-90 transition-opacity" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Reference Images (internal only) */}
          {isInternalUser && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Reference Photos</h2>
                <ImageUpload orderItemId={orderItemId} type="reference" label="Reference Photo" onUploaded={load} />
              </div>
              {referenceImages.length === 0 ? (
                <p className="text-sm text-gray-400">No reference photos yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {referenceImages.map((img) => (
                    <a key={img.id} href={img.filePath} target="_blank" rel="noopener noreferrer">
                      <img src={img.filePath} alt={img.fileName}
                        className="w-full h-24 object-cover rounded border border-gray-200 hover:opacity-90 transition-opacity" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Report Issue */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <ReportIssueForm orderItemId={orderItemId} isSupplier={isSupplier} onSubmitted={load} />
          </div>

          {/* Comments */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">Comments</h2>
            <div className="space-y-3 mb-4">
              {order.comments.length === 0 && <p className="text-sm text-gray-400">No comments yet.</p>}
              {order.comments.map((c) => (
                <div key={c.id} className={`rounded-md p-3 text-sm ${c.isInternal ? "bg-yellow-50 border border-yellow-200" : "bg-gray-50"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">{c.userName ?? "Unknown"}</span>
                    {c.isInternal && <span className="text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded font-semibold">Internal</span>}
                    <span className="text-xs text-gray-400 ml-auto">{fmtFull(c.createdAt)}</span>
                  </div>
                  <p className="text-gray-700 whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
            </div>
            <form onSubmit={submitComment} className="space-y-2">
              <textarea value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment…" rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none resize-none" />
              <div className="flex items-center justify-between">
                {isInternalUser && (
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={isInternalComment} onChange={(e) => setIsInternalComment(e.target.checked)} className="rounded" />
                    Internal only
                  </label>
                )}
                <button type="submit" disabled={!comment.trim()}
                  className="ml-auto rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition-colors">
                  Post comment
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Stage control */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Stage</h2>
            <select value={currentColumn} onChange={(e) => updateColumn(e.target.value)} disabled={saving}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none">
              {COLUMN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Manufacturer control */}
          {isInternalUser && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                {order.supplierId ? "Manufacturer" : "Nominate Supplier"}
              </h2>
              <select value={order.supplierId ?? ""} onChange={(e) => updateSupplier(e.target.value)} disabled={saving}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none">
                <option value="">Unassigned</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {order.supplierName && (
                <p className="text-xs text-gray-500 mt-2">
                  {order.supplierNickname && <span className="font-semibold text-gray-700">{order.supplierNickname} · </span>}
                  {order.supplierName}
                </p>
              )}
            </div>
          )}

          {/* Status history */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">History</h2>
            {order.statusHistory.length === 0 ? (
              <p className="text-xs text-gray-400">No history yet.</p>
            ) : (
              <ol className="space-y-3">
                {order.statusHistory.map((h) => (
                  <li key={h.id} className="flex gap-3 text-xs">
                    <div className="h-2 w-2 rounded-full bg-gray-400 shrink-0 mt-1.5" />
                    <div>
                      <div className="text-gray-700">
                        {h.fromStatus
                          ? <><span className="font-medium">{h.fromStatus}</span>{" → "}<span className="font-medium">{h.toStatus}</span></>
                          : <span className="font-medium">Set to {h.toStatus}</span>}
                      </div>
                      <div className="text-gray-400 mt-0.5">{h.changedByName ?? "System"} · {fmtFull(h.changedAt)}</div>
                      {h.note && <div className="text-gray-500 mt-0.5 italic">{h.note}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
