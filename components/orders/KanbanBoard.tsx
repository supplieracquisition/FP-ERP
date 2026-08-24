"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { CSS } from "@dnd-kit/utilities";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";

type Supplier = { id: number; name: string };
type TeamMember = { id: number; name: string };

/** How often the board re-reads the server while the tab is visible. */
const POLL_MS = 20_000;

type OrderItem = {
  id: number;
  orderId: string;
  orderItemId: string;
  orderName: string | null;
  styleCode: string | null;
  color: string | null;
  quantity: number | null;
  totalValue: number | null;
  printType: string | null;
  decoratingMethods: string | null;
  dueDate: string | null;
  printerShipDate: string | null;
  originalPrinterShipDate: string | null;
  supplierShipDate: string | null;
  delayReason: string | null;
  testPrintStatus: string | null;
  shippingMethod: string | null;
  requiresTestPrint: boolean;
  status: string;
  productionStage: string | null;
  trackingNumber: string | null;
  templatePdf: string | null;
  supplierName: string | null;
  supplierNickname: string | null;
  supplierId: number | null;
  nominatedSupplierId: number | null;
  processorUserId: number | null;
  claimedAt: string | null;
  /** Server-computed. Never re-derive this from claimedAt in the browser — the
   *  client's clock is not the one the claim write is judged against. */
  claimActive: boolean;
};

/**
 * Is this card locked to somebody else?
 *
 * Locked means claimed, live, and not by me. My own claim is not a lock — I can
 * still work the card — and an expired claim is not a lock either, which is why
 * this reads the server's claimActive rather than looking at claimedAt.
 */
function lockedByOther(item: OrderItem, userId?: number): boolean {
  return item.claimActive && item.processorUserId !== userId;
}

// Column = effective stage (status + productionStage combined)
const COLUMNS = [
  { id: "unassigned",         label: "UNASSIGNED" },
  { id: "sample_production",  label: "SAMPLE PRODUCTION" },
  { id: "fabric_sourcing",    label: "FABRIC SOURCING / CUTTING" },
  { id: "printing",           label: "PRINTING" },
  { id: "assembly",           label: "ASSEMBLY" },
  { id: "qa_packing",         label: "QA + PACKING" },
  { id: "shipped",            label: "SHIPPED" },
];

const ALL_COLUMNS = [...COLUMNS, { id: "completed", label: "DELIVERED" }];

const COLUMN_OPTIONS = [
  { value: "unassigned",        label: "Unassigned" },
  { value: "sample_production", label: "Sample Production" },
  { value: "fabric_sourcing",   label: "Fabric Sourcing / Cutting" },
  { value: "printing",          label: "Printing" },
  { value: "assembly",          label: "Assembly" },
  { value: "qa_packing",        label: "QA + Packing" },
  { value: "shipped",           label: "Shipped" },
  { value: "completed",         label: "Delivered" },
];

function effectiveColumn(item: OrderItem): string {
  // The client-side spelling of IN_POOL: in the pool until actually assigned.
  // Nomination does not take an order out of the pool — it names who should
  // MAKE it, not who is working it. Keep this in step with lib/claims.ts.
  if (!item.supplierId) {
    return "unassigned";
  }
  if (item.status === "shipped")   return "shipped";
  if (item.status === "completed") return "completed";
  return item.productionStage ?? "sample_production";
}

function StyleIcon({ styleCode, color }: { styleCode: string | null; color: string | null }) {
  if (!styleCode) return null;
  const style = styleCode.toLowerCase().replace(/\s+/g, "");
  const src = `/api/icon?style=${encodeURIComponent(style)}&color=${encodeURIComponent(color ?? "")}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={styleCode} width={40} height={40}
      className="shrink-0 rounded object-contain w-10 h-10"
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
  );
}

function TrackingInput({ orderItemId, current, onSaved, isShipped }: {
  orderItemId: string; current: string | null; onSaved: () => void; isShipped: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function save() {
    const res = await fetch(`/api/orders/${orderItemId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingNumber: value.trim() || null }),
    });
    if (res.ok) { onSaved(); setEditing(false); }
    else toast.error("Failed to save tracking number");
  }

  if (editing) return (
    <div className="flex gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
      <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        placeholder="Enter tracking #"
        className="flex-1 text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:border-gray-700 font-mono" />
      <button onClick={save} className="text-xs bg-gray-900 text-white px-2 py-1 rounded hover:bg-gray-700">✓</button>
    </div>
  );

  return (
    <div className="mt-1 flex items-center gap-2">
      {current ? (
        <>
          <a href={`https://www.ups.com/track?tracknum=${current}`} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-mono text-blue-600 hover:text-blue-800 underline">{current} ↗</a>
          <button onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="text-xs text-gray-400 hover:text-gray-600">Edit</button>
        </>
      ) : (
        <button onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className={`text-xs font-semibold ${isShipped ? "text-red-600 hover:text-red-800" : "text-blue-500 hover:text-blue-700"}`}>
          + Add tracking #
        </button>
      )}
    </div>
  );
}

function ShippingToggle({ orderItemId, current, onSaved }: {
  orderItemId: string; current: string | null; onSaved: () => void;
}) {
  async function set(method: string) {
    const next = current === method ? null : method;
    const res = await fetch(`/api/orders/${orderItemId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shippingMethod: next }),
    });
    if (res.ok) onSaved();
    else toast.error("Failed to update shipping method");
  }

  // Once a method is selected, only show that button (click to clear)
  // When nothing is selected, show both options
  const showAir = !current || current === "air";
  const showSea = !current || current === "sea";

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {showAir && (
        <button
          onClick={() => set("air")}
          className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
            current === "air"
              ? "bg-sky-500 border-sky-500 text-white"
              : "border-gray-300 text-gray-400 hover:border-sky-400 hover:text-sky-500"
          }`}>
          ✈ AIR
        </button>
      )}
      {showSea && (
        <button
          onClick={() => set("sea")}
          className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
            current === "sea"
              ? "bg-blue-700 border-blue-700 text-white"
              : "border-gray-300 text-gray-400 hover:border-blue-600 hover:text-blue-600"
          }`}>
          🚢 SEA
        </button>
      )}
    </div>
  );
}

function ColumnSelect({ orderItemId, current, onSaved, isSupplier, disabled }: {
  orderItemId: string; current: string; onSaved: () => void; isSupplier?: boolean; disabled?: boolean;
}) {
  async function change(column: string) {
    const res = await fetch(`/api/orders/${orderItemId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ column }),
    });
    if (res.ok) onSaved();
    else toast.error("Failed to update stage");
  }

  const options = isSupplier
    ? COLUMN_OPTIONS.filter((o) => o.value !== "completed")
    : COLUMN_OPTIONS;

  return (
    <select value={current} disabled={disabled}
      onChange={(e) => { e.stopPropagation(); change(e.target.value); }}
      onClick={(e) => e.stopPropagation()}
      className="mt-1 w-full text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:border-gray-700 bg-white disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/**
 * The claim strip on a pool card: who holds it, or a button to take it.
 *
 * Only ever rendered for orders still in the pool. Once a PO is built the
 * processor is a permanent record rather than a lock, and there is nothing here
 * to act on.
 */
function ClaimBar({ item, userId, userRole, team, onRefresh }: {
  item: OrderItem; userId?: number; userRole?: string; team: TeamMember[]; onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const isAdmin = userRole === "admin";
  const mine = item.claimActive && item.processorUserId === userId;
  const locked = lockedByOther(item, userId);
  const holder = team.find((t) => t.id === item.processorUserId)?.name ?? "Someone else";

  async function act(method: "POST" | "DELETE") {
    setBusy(true);
    const res = await fetch(`/api/orders/${item.orderItemId}/claim`, { method });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      toast.success(method === "POST" ? "Order claimed" : "Claim released");
    } else {
      // 409 means somebody got there first. Refreshing is part of the message:
      // the board is about to show the card greyed and the toast explains why.
      toast.error(data.error ?? "Failed");
    }
    onRefresh();
  }

  if (locked) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 space-y-1">
        <div className="text-xs font-semibold text-amber-900">
          🔒 Claimed by {holder}
          {item.claimedAt && (
            <span className="font-normal text-amber-700">
              {" "}· {format(new Date(item.claimedAt), "MMM d, HH:mm")}
            </span>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); act("DELETE"); }}
            disabled={busy}
            className="text-xs font-semibold text-amber-800 underline hover:text-amber-950 disabled:opacity-50">
            Release claim (admin)
          </button>
        )}
      </div>
    );
  }

  if (mine) {
    return (
      <div className="rounded border border-blue-300 bg-blue-50 px-2 py-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-blue-900">✎ Claimed by you</span>
        <button
          onClick={(e) => { e.stopPropagation(); act("DELETE"); }}
          disabled={busy}
          className="text-xs font-semibold text-blue-700 underline hover:text-blue-900 disabled:opacity-50">
          Release
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); act("POST"); }}
      disabled={busy}
      className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-500 hover:bg-gray-50 disabled:opacity-50">
      {busy ? "Claiming…" : "Claim to build PO"}
    </button>
  );
}

function OrderCard({ item, isDragging = false, onRefresh, userRole, suppliers = [], userId, team = [] }: {
  item: OrderItem; isDragging?: boolean; onRefresh: () => void; userRole?: string; suppliers?: Supplier[];
  userId?: number; team?: TeamMember[];
}) {
  const fmt = (d: string | null) => d ? format(new Date(d), "MM/dd/yy") : null;
  const col = effectiveColumn(item);
  const isShipped = item.status === "shipped" || item.status === "completed";
  const isSupplier = userRole === "supplier";
  const inPool = !item.supplierId;
  // Locked to someone else: every control on this card is disabled below, and
  // DraggableCard refuses to make it draggable at all.
  const locked = lockedByOther(item, userId);

  const shipsInDays = item.supplierShipDate
    ? differenceInDays(new Date(item.supplierShipDate), new Date())
    : null;

  const handleNominateSupplier = async (supplierId: string) => {
    const res = await fetch(`/api/orders/${item.orderItemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nominatedSupplierId: parseInt(supplierId) }),
    });
    if (res.ok) {
      toast.success("Supplier nominated");
      onRefresh();
    } else {
      toast.error("Failed to nominate supplier");
    }
  };

  const shippedDaysLate = isShipped && item.supplierShipDate && item.dueDate
    ? differenceInDays(new Date(item.supplierShipDate), new Date(item.dueDate))
    : null;

  const daysOverdue = !isShipped && item.supplierShipDate
    ? differenceInDays(new Date(), new Date(item.supplierShipDate))
    : null;
  const isOverdue = daysOverdue !== null && daysOverdue >= 1;

  const shipDateChanged = item.originalPrinterShipDate &&
    item.supplierShipDate &&
    item.originalPrinterShipDate !== item.supplierShipDate;

  const shipsInColor =
    shipsInDays === null ? "text-gray-400"
    : shipsInDays < 0   ? "text-red-600"
    : shipsInDays < 5   ? "text-red-600"
    : shipsInDays < 10  ? "text-amber-600"
    : shipsInDays <= 30 ? "text-yellow-500"
    : "text-gray-900";

  const shipLabel = col === "sample_production" && item.requiresTestPrint ? "TEST PRINT DUE" : "SHIPS";

  return (
    <div className={`bg-white border rounded p-3 text-xs space-y-1 select-none ${
      locked
        ? "border-gray-300 opacity-60 cursor-not-allowed"
        : isDragging ? "border-gray-300 shadow-xl rotate-1 opacity-90 cursor-grabbing"
        : "border-gray-300 cursor-grab hover:border-gray-400 hover:shadow-sm transition-all"
    }`}>
      {/* Test print approval flag */}
      {item.testPrintStatus === "needs_approval" && !isSupplier && (
        <div className="text-xs font-bold uppercase tracking-wide text-orange-600 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">
          🖨 TEST PRINT NEEDS APPROVAL
        </div>
      )}

      {/* Urgency indicators */}
      {isShipped && item.trackingNumber && shippedDaysLate !== null && (
        <div className={`text-xs font-bold uppercase tracking-wide ${shippedDaysLate > 0 ? "text-red-600" : "text-green-600"}`}>
          {shippedDaysLate <= 0 ? "SHIPPED ON-TIME" : `SHIPPED ${shippedDaysLate} DAY${shippedDaysLate !== 1 ? "S" : ""} LATE`}
        </div>
      )}
      {isOverdue && (
        <div className="text-xs font-bold uppercase tracking-wide text-red-800 underline underline-offset-2">
          OVERDUE BY {daysOverdue} DAY{daysOverdue !== 1 ? "S" : ""}
        </div>
      )}
      {!isShipped && !isOverdue && shipsInDays !== null && shipsInDays >= 0 && (
        <div className={`text-xs font-bold uppercase tracking-wide ${shipsInColor}`}>
          {shipsInDays === 0
            ? `${shipLabel} TODAY`
            : `${shipLabel} IN ${shipsInDays} DAY${shipsInDays !== 1 ? "S" : ""}`}
        </div>
      )}

      {/* Order name */}
      {item.orderName && (
        <div className="text-xs font-semibold text-gray-800 leading-tight">{item.orderName}</div>
      )}

      {/* Order ID + icon + FP link */}
      <div className="flex items-start gap-2">
        <StyleIcon styleCode={item.styleCode} color={item.color} />
        <div className="flex-1 min-w-0">
          <Link href={`${isSupplier ? "/supplier" : ""}/orders/${item.orderItemId}`}
            onClick={(e) => e.stopPropagation()}
            className="block font-bold text-sm text-gray-900 hover:text-blue-600 font-mono leading-tight">
            ORDER {item.orderItemId}
          </Link>
          <a href={`https://v3.freshprints.com/dashboard/order/${item.orderId}`}
            target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-blue-500 hover:text-blue-700 underline">
            View on FP ↗
          </a>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-0.5 text-gray-600 pt-0.5">
        <div><span className="font-semibold uppercase tracking-wide">Style:</span> {item.styleCode ?? "—"}</div>
        <div><span className="font-semibold uppercase tracking-wide">Color:</span> {item.color ?? "—"}</div>
        <div><span className="font-semibold uppercase tracking-wide">Units:</span> {item.quantity?.toLocaleString() ?? "—"}</div>
        {!isSupplier && item.totalValue && item.totalValue > 0 && (
          <div><span className="font-semibold uppercase tracking-wide">Value:</span> ${item.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
        )}
        <div><span className="font-semibold uppercase tracking-wide">Print:</span> {item.printType ?? "—"}</div>
        {item.decoratingMethods && (
          <div className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-yellow-100 border border-yellow-300 text-yellow-900">
            <span className="font-semibold uppercase tracking-wide">Decoration:</span> {item.decoratingMethods}
          </div>
        )}
        {fmt(item.supplierShipDate) && (
          <div className="flex items-center gap-1">
            <span className="font-semibold uppercase tracking-wide">Ship Date:</span>{" "}
            {fmt(item.supplierShipDate)}
            {shipDateChanged && <span title={`Original: ${fmt(item.originalPrinterShipDate)}`} className="text-amber-500 cursor-help">✎</span>}
          </div>
        )}
        <ShippingToggle orderItemId={item.orderItemId} current={item.shippingMethod} onSaved={onRefresh} />
        {/* Test print — read-only badge; edit in order detail */}
        {!isSupplier && item.requiresTestPrint && (
          <div className="text-xs px-2 py-0.5 rounded border bg-amber-100 border-amber-300 text-amber-800 font-medium w-fit">
            🖨 Needs Test Print
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-1.5 border-t border-gray-100 space-y-1">
        {!isSupplier && inPool && (
          <ClaimBar item={item} userId={userId} userRole={userRole} team={team} onRefresh={onRefresh} />
        )}

        {!isSupplier && (
          <>
            {item.supplierId ? (
              // Assigned: show supplier name
              <div className="text-gray-600 text-right text-sm">
                <span className="font-semibold uppercase tracking-wide">Manufacturer:</span>{" "}
                {item.supplierNickname
                  ? <><span className="font-semibold">{item.supplierNickname}</span> <span className="text-gray-400 text-xs">({item.supplierName})</span></>
                  : item.supplierName}
              </div>
            ) : (
              // Unassigned: show nominated supplier or dropdown
              <div className="text-sm">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
                  {item.nominatedSupplierId ? "Nominated Supplier" : "Nominate Supplier"}
                </label>
                <select
                  value={item.nominatedSupplierId ?? ""}
                  disabled={locked}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleNominateSupplier(e.target.value);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  <option value="">Select supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        <ColumnSelect
          orderItemId={item.orderItemId}
          current={col}
          onSaved={onRefresh}
          isSupplier={isSupplier}
          disabled={locked}
        />

        {col === "shipped" && (
          <div className="text-left">
            <span className="font-semibold uppercase tracking-wide text-gray-600">Tracking #:</span>
            <TrackingInput orderItemId={item.orderItemId} current={item.trackingNumber}
              onSaved={onRefresh} isShipped={isShipped} />
          </div>
        )}
      </div>
    </div>
  );
}

function DroppableColumn({ column, items, onRefresh, userRole, showDelivered, onToggleDelivered, deliveredCount, suppliers = [], userId, team = [] }: {
  column: { id: string; label: string }; items: OrderItem[]; onRefresh: () => void; userRole?: string;
  showDelivered?: boolean; onToggleDelivered?: () => void; deliveredCount?: number; suppliers?: Supplier[];
  userId?: number; team?: TeamMember[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div className="flex flex-col flex-1 min-w-[180px]">
      <div className="mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-800">{column.label}</h2>
          {column.id === "shipped" && onToggleDelivered && (
            <button onClick={onToggleDelivered}
              className={`text-xs rounded border px-2 py-0.5 font-medium transition-colors ${
                showDelivered ? "border-gray-700 bg-gray-700 text-white" : "border-gray-300 text-gray-500 hover:bg-gray-100"
              }`}>
              {showDelivered ? "Hide Delivered" : "Show Delivered"}
              {!showDelivered && deliveredCount != null && deliveredCount > 0 && (
                <span className="ml-1 bg-gray-200 text-gray-700 rounded-full px-1.5">{deliveredCount}</span>
              )}
            </button>
          )}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">{items.length} order{items.length !== 1 ? "s" : ""}</div>
      </div>
      <div ref={setNodeRef}
        className={`flex-1 min-h-[120px] rounded-lg p-2 space-y-2 transition-colors ${isOver ? "bg-blue-50 ring-2 ring-blue-300" : "bg-gray-100"}`}>
        {items.map((item) => (
          <DraggableCard key={item.orderItemId} item={item} onRefresh={onRefresh} userRole={userRole}
            suppliers={suppliers} userId={userId} team={team} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ item, onRefresh, userRole, suppliers = [], userId, team = [] }: {
  item: OrderItem; onRefresh: () => void; userRole?: string; suppliers?: Supplier[];
  userId?: number; team?: TeamMember[];
}) {
  const locked = lockedByOther(item, userId);

  // disabled is what actually prevents the drag. Greying the card out in CSS
  // only makes it LOOK locked: dnd-kit would still fire drag events, the drop
  // would still PATCH the column, and the server would still accept it —
  // anything in the pool is reachable by every internal user, so there is no
  // second line of defence behind this one. pointer-events:none would stop the
  // drag but would also kill the admin's Release button on the same card.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.orderItemId,
    data: { item },
    disabled: locked,
  });
  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0 : 1 }
    : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <OrderCard item={item} onRefresh={onRefresh} userRole={userRole} suppliers={suppliers}
        userId={userId} team={team} />
    </div>
  );
}

export function KanbanBoard({ suppliers, userRole, userId, team = [] }: {
  suppliers: Supplier[]; userRole?: string; userId?: number; team?: TeamMember[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierFilter, setSupplierFilter] = useState(searchParams.get("supplierId") ?? "");
  const [styleFilter, setStyleFilter] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const [decorationFilter, setDecorationFilter] = useState("");
  const [printTypeFilter, setPrintTypeFilter] = useState("");
  const [shipDateFilter, setShipDateFilter] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [showDelivered, setShowDelivered] = useState(false);
  const [activeItem, setActiveItem] = useState<OrderItem | null>(null);
  const [search, setSearch] = useState("");
  const isSupplier = userRole === "supplier";
  const isAdmin = userRole === "admin";

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Guards against a poll landing on top of work in progress. A drag is
  // optimistic — handleDragEnd moves the card locally, then PATCHes — so a poll
  // that resolved mid-flight would overwrite the optimistic state with the
  // pre-move server copy and the card would visibly snap back.
  const inFlight = useRef(false);
  const busy = useRef(false);

  const fetchOrders = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const params = new URLSearchParams({ kanban: "1" });
      if (supplierFilter) params.set("supplierId", supplierFilter);
      const res = await fetch(`/api/orders?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
      setLoading(false);
    } finally {
      inFlight.current = false;
    }
  }, [supplierFilter]);

  useEffect(() => { setLoading(true); fetchOrders(); }, [fetchOrders]);

  /**
   * Keep the board roughly current so a claim someone else takes shows up
   * without a manual reload.
   *
   * Paused whenever the tab is hidden: a board left open on a second monitor
   * overnight would otherwise poll ~4,300 times for nobody. On becoming visible
   * it refetches immediately rather than waiting out the interval, so a
   * returning user is not looking at a stale board for 20 seconds.
   *
   * This is comfort, not correctness. Polling only decides how quickly a card
   * turns grey; whether a claim actually succeeds is settled by the conditional
   * write in POST /api/orders/[id]/claim, which holds no matter how stale this
   * view is.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        if (busy.current) return;
        fetchOrders();
      }, POLL_MS);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    const onVisibility = () => {
      if (document.visibilityState === "visible") { fetchOrders(); start(); }
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [fetchOrders]);

  async function handleDragEnd(event: DragEndEvent) {
    // handleDragStart set busy.current. Every exit below — dropped outside a
    // column, unknown card, same column, refused move, or a completed write —
    // has to clear it, or one cancelled drag would silently stop polling for
    // the rest of the session. Hence the single finally wrapping the lot.
    try {
      await runDragEnd(event);
    } finally {
      busy.current = false;
    }
  }

  async function runDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveItem(null);
    if (!over) return;

    const orderItemId = active.id as string;
    const item = items.find((i) => i.orderItemId === orderItemId);
    if (!item) return;

    // Belt and braces behind useDraggable({ disabled }). dnd-kit should never
    // start a drag on a locked card, so reaching here means something changed
    // under us — most likely a poll landing a fresh claim mid-drag.
    if (lockedByOther(item, userId)) {
      toast.error("That order is claimed by someone else");
      fetchOrders();
      return;
    }

    const columnIds = ALL_COLUMNS.map((c) => c.id);
    let newColumn: string;
    if (columnIds.includes(over.id as string)) {
      newColumn = over.id as string;
    } else {
      const overItem = items.find((i) => i.orderItemId === over.id);
      if (!overItem) return;
      newColumn = effectiveColumn(overItem);
    }

    if (effectiveColumn(item) === newColumn) return;

    // Validate: only orders requiring test print can move to sample_production
    if (newColumn === "sample_production" && !item.requiresTestPrint) {
      toast.error("Only orders requiring test print can move to Sample Production");
      return;
    }

    setItems((prev) => prev.map((i) =>
      i.orderItemId === orderItemId
        ? {
            ...i,
            status: newColumn === "shipped" ? "shipped" : newColumn === "completed" ? "completed" : "in_production",
            productionStage: ["shipped", "completed"].includes(newColumn) ? null : newColumn,
          }
        : i
    ));

    // Held across the write so the poll cannot resolve on top of the optimistic
    // move above and snap the card back to where it started.
    busy.current = true;
    try {
      const res = await fetch(`/api/orders/${orderItemId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column: newColumn }),
      });

      if (res.ok) toast.success(`Moved to ${ALL_COLUMNS.find((c) => c.id === newColumn)?.label ?? newColumn}`);
      else { toast.error("Failed to move order"); fetchOrders(); }
    } finally {
      busy.current = false;
    }
  }

  function handleDragStart(event: DragStartEvent) {
    busy.current = true;
    setActiveItem(items.find((i) => i.orderItemId === event.active.id) ?? null);
  }

  const styleOptions = [...new Set(items.map((i) => i.styleCode).filter(Boolean))].sort() as string[];
  const colorOptions = [...new Set(items.map((i) => i.color).filter(Boolean))].sort() as string[];
  const decorationOptions = [...new Set(
    items.flatMap((i) => i.decoratingMethods ? i.decoratingMethods.split(";").map((s) => s.trim()).filter(Boolean) : [])
  )].sort();
  const printTypeOptions = [...new Set(
    items.flatMap((i) => i.printType ? i.printType.split(";").map((s) => s.trim()).filter(Boolean) : [])
  )].sort();

  const q = search.trim().toLowerCase();
  let filtered = items.filter((i) => {
    if (!showDelivered && i.status === "completed") return false;
    if (q) {
      const matches =
        i.orderItemId.toLowerCase().includes(q) ||
        i.orderId.toLowerCase().includes(q) ||
        (i.styleCode ?? "").toLowerCase().includes(q) ||
        (i.color ?? "").toLowerCase().includes(q) ||
        (i.supplierName ?? "").toLowerCase().includes(q) ||
        (i.orderName ?? "").toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (styleFilter && i.styleCode !== styleFilter) return false;
    if (colorFilter && i.color !== colorFilter) return false;
    if (decorationFilter && !(i.decoratingMethods ?? "").split(";").map((s) => s.trim()).includes(decorationFilter)) return false;
    if (printTypeFilter && !(i.printType ?? "").split(";").map((s) => s.trim()).includes(printTypeFilter)) return false;
    if (shipDateFilter && i.supplierShipDate) {
      const days = differenceInDays(new Date(i.supplierShipDate), new Date());
      if (shipDateFilter === "today" && days !== 0 && days >= 0) return false;
      if (shipDateFilter === "3"  && days > 3)  return false;
      if (shipDateFilter === "7"  && days > 7)  return false;
      if (shipDateFilter === "14" && days > 14) return false;
    } else if (shipDateFilter) {
      return false;
    }
    return true;
  });

  // Sort
  if (sortBy === "ship_date")     filtered = [...filtered].sort((a, b) => (a.supplierShipDate ?? "").localeCompare(b.supplierShipDate ?? ""));
  if (sortBy === "quantity_asc")  filtered = [...filtered].sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0));
  if (sortBy === "quantity_desc") filtered = [...filtered].sort((a, b) => (b.quantity ?? 0) - (a.quantity ?? 0));
  if (isAdmin && sortBy === "value_asc")  filtered = [...filtered].sort((a, b) => (a.totalValue ?? 0) - (b.totalValue ?? 0));
  if (isAdmin && sortBy === "value_desc") filtered = [...filtered].sort((a, b) => (b.totalValue ?? 0) - (a.totalValue ?? 0));

  const visibleColumns = showDelivered ? ALL_COLUMNS : COLUMNS;
  const grouped = Object.fromEntries(
    ALL_COLUMNS.map((col) => [col.id, filtered.filter((i) => effectiveColumn(i) === col.id)])
  );

  const exactMatch = q ? items.find((i) => i.orderItemId.toLowerCase() === q) : null;
  const activeFilterCount = [styleFilter, colorFilter, decorationFilter, printTypeFilter, supplierFilter, shipDateFilter].filter(Boolean).length;

  const filterSelect = (label: string, value: string, onChange: (v: string) => void, options: { value: string; label: string }[]) => (
    <select key={label} value={value} onChange={(e) => onChange(e.target.value)}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-gray-700 bg-white transition-colors ${
        value ? "border-gray-800 text-gray-900 font-bold bg-gray-50" : "border-gray-300 text-gray-500"
      }`}>
      <option value="">{label}: All</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {/* Row 1: search + count + sort + delivered toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (exactMatch) router.push(`${isSupplier ? "/supplier" : ""}/orders/${exactMatch.orderItemId}`);
                  else if (q && filtered.length === 1) router.push(`${isSupplier ? "/supplier" : ""}/orders/${filtered[0].orderItemId}`);
                }
              }}
              placeholder="Search orders…"
              className="rounded-md border border-gray-300 pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:border-gray-700 w-52" />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs">✕</button>
            )}
          </div>

          {exactMatch && (
            <a href={`${isSupplier ? "/supplier" : ""}/orders/${exactMatch.orderItemId}`}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700">
              Open {exactMatch.orderItemId} →
            </a>
          )}

          {/* Sort */}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-gray-700 bg-white ${
              sortBy ? "border-gray-800 text-gray-900 font-bold bg-gray-50" : "border-gray-300 text-gray-500"
            }`}>
            <option value="">Sort: Default</option>
            <option value="ship_date">Ship Date: Soonest First</option>
            <option value="quantity_asc">Units: Low → High</option>
            <option value="quantity_desc">Units: High → Low</option>
            {isAdmin && <option value="value_asc">Value: Low → High</option>}
            {isAdmin && <option value="value_desc">Value: High → Low</option>}
          </select>

          <span className="text-xs text-gray-400 ml-auto">
            {loading ? "Loading…" : filtered.length !== items.length ? `${filtered.length} of ${items.length} orders` : `${items.length} orders`}
          </span>
        </div>

        {/* Row 2: filter dropdowns */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isSupplier && filterSelect("Manufacturer", supplierFilter, setSupplierFilter,
            suppliers.map((s) => ({ value: String(s.id), label: s.name })))}
          {filterSelect("Style Code", styleFilter, setStyleFilter, styleOptions.map((s) => ({ value: s, label: s })))}
          {filterSelect("Color", colorFilter, setColorFilter, colorOptions.map((s) => ({ value: s, label: s })))}
          {filterSelect("Print Type", printTypeFilter, setPrintTypeFilter, printTypeOptions.map((s) => ({ value: s, label: s })))}
          {filterSelect("Decoration", decorationFilter, setDecorationFilter, decorationOptions.map((s) => ({ value: s, label: s })))}
          {filterSelect("Ship Date", shipDateFilter, setShipDateFilter, [
            { value: "today", label: "Shipping Today" },
            { value: "3",    label: "Within 3 Days" },
            { value: "7",    label: "Within 7 Days" },
            { value: "14",   label: "Within 14 Days" },
          ])}
          {(activeFilterCount > 0 || search) && (
            <button onClick={() => { setSearch(""); setSupplierFilter(""); setStyleFilter(""); setColorFilter(""); setDecorationFilter(""); setPrintTypeFilter(""); setShipDateFilter(""); }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:border-gray-400 transition-colors">
              Clear filters
            </button>
          )}
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-5 w-full">
            {visibleColumns.map((col) => (
              <DroppableColumn key={col.id} column={col} items={grouped[col.id] ?? []}
                onRefresh={fetchOrders} userRole={userRole}
                showDelivered={col.id === "shipped" ? showDelivered : undefined}
                onToggleDelivered={col.id === "shipped" ? () => setShowDelivered(!showDelivered) : undefined}
                deliveredCount={col.id === "shipped" ? grouped["completed"]?.length : undefined}
                suppliers={suppliers} userId={userId} team={team} />
            ))}
          </div>
        </div>
        <DragOverlay>
          {activeItem && <OrderCard item={activeItem} isDragging onRefresh={() => {}} userRole={userRole}
            userId={userId} team={team} />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
