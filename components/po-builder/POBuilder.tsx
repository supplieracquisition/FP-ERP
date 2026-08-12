"use client";

import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { toast } from "sonner";

type Supplier = {
  id: number;
  name: string;
  nickname: string | null;
  contactEmail: string | null;
  address?: string | null;
  pocName?: string | null;
  pocPhone?: string | null;
};

type FPESupplier = {
  supplierName: string;
  salesRep: string;
  email: string;
  currentSupplier: boolean;
  standardShippingMoq: string;
  economyShippingMoq: string;
  v4BlankSeaPrice: string;
  v4BlanksAirPrice: string;
  airShipPrice: string;
  seaShipPrice: string;
  bulkProductionTimeline: string;
  airShippingTimeline: string;
  seaShippingTimeline: string;
  weights: string;
};

type FabricColorOption = {
  colorCode: string;
  supplier: string;
};

type OrderItem = {
  id: number;
  orderItemId: string;
  orderName: string | null;
  styleCode: string | null;
  color: string | null;
  printType: string | null;
  decoratingMethods: string | null;
  supplierId: number | null;
  nominatedSupplierId: number | null;
  supplierName: string | null;
  quantity: number | null;
  dueDate: string | null;
  orderId?: string | null;
  clientName: string | null;
  deliveryAddress: string | null;
  requiresTestPrint: boolean;
  templatePdf: string | null;
};

type Sizes = { xs: string; s: string; m: string; l: string; xl: string; xxl: string; xxxl: string };

const EMPTY_SIZES: Sizes = { xs: "", s: "", m: "", l: "", xl: "", xxl: "", xxxl: "" };

type LineItem = {
  orderItem: OrderItem;
  fabricSwatchCode: string;
  fabricColorCode: string;
  fabricColorOptions: FabricColorOption[];
  availableFabricCodes: string[];
  selectedFabricCode: string;
  sizes: Sizes;
  extras: Sizes;
  overrideStyleCode?: string;
};

const SIZE_KEYS: (keyof Sizes)[] = ["xs", "s", "m", "l", "xl", "xxl", "xxxl"];
const SIZE_LABELS: Record<keyof Sizes, string> = { xs: "XS", s: "S", m: "M", l: "L", xl: "XL", xxl: "2XL", xxxl: "3XL" };

function sizeTotal(sizes: Sizes, extras: Sizes): number {
  return SIZE_KEYS.reduce((sum, k) => {
    const base = parseInt(sizes[k]) || 0;
    const extra = parseInt(extras[k]) || 0;
    return sum + base + extra;
  }, 0);
}

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function row(...cells: string[]): string {
  return cells.map(escapeCsv).join(",");
}

function generateCSV(
  poNumber: string,
  poDate: string,
  deliveryDate: string,
  shippingMethod: string,
  clientName: string,
  deliveryAddress: string,
  supplier: Supplier | null,
  lineItems: LineItem[]
): string {
  const fmtDate = (d: string) => {
    if (!d) return "";
    try { return format(new Date(d), "M/d/yyyy"); } catch { return d; }
  };

  const lines: string[] = [];

  // Header
  lines.push(row(`PURCHASE ORDER #: ${poNumber}`));
  lines.push(row(""));
  lines.push(row("Purchase Order Date:", fmtDate(poDate), "", "", "Target Delivery (In-hand) Date:", fmtDate(deliveryDate)));
  lines.push(row(""));
  lines.push(row(""));

  // Shipping & Vendor Details
  lines.push(row("SHIPPING DETAILS", "", "", "", "Fresh Prints LLC", "", "", "VENDOR DETAILS"));
  lines.push(row("Fresh Prints LLC", "", "", "", "150 W 25th Street, Suite 501", "", "", `Name`, supplier?.name ?? ""));
  lines.push(row("150 W 25th Street, Suite 501", "", "", "", "New York, NY 10001", "", "", `Address`, supplier?.address ?? ""));
  lines.push(row("New York, NY 10001", "", "", "", ""));
  lines.push(row(""));
  lines.push(row(`Client Name: ${clientName}`, "", "", "", "", "", "", "CONTACT PERSON:", supplier?.pocName ?? ""));
  lines.push(row(`Delivery Details:`, "", "", "", "", "", "", "CONTACT:", `${supplier?.contactEmail ?? ""} | ${supplier?.pocPhone ?? ""}`));
  lines.push(row(`Shipping name: ${clientName}`, "", "", "", "", "", "", "(1) SHIPPING METHOD:", shippingMethod));
  lines.push(row(`Attention name: N/A`));
  lines.push(row(`Street: ${deliveryAddress.split('\n')[0] ?? ""}`));
  lines.push(row(`City: ${deliveryAddress.split('\n')[1] ?? ""}`));
  lines.push(row(`Phone no:`));
  lines.push(row(""));

  // Order Details Header
  lines.push(row("ORDER DETAILS", "", "", "", "DO NOT EDIT the cells if the column has an asterisk \"*\""));
  lines.push(row("Input the data in this sequence: 1. Add Shipping Method 2. Name of the Item 3. Pick the Color by selecting the fabric in the Color Tab 4. Add Print/Decoration Details 5. Add quantity breakdowns. 6. Leave notes for the manufacturer below the table. 7. CC exclusives@freshprints.com on the order processing email you send to the manufacturer."));
  lines.push(row(""));

  // Table Header
  lines.push(row("S.no", "Item ID", "NAME OF ITEM", "FABRIC SWATCH CODE", "FABRIC COLOR CODE", "SUPPLIER", "Print Method Details", "Decoration Method Details", "XS", "S", "M", "L", "XL", "2XL", "3XL", "TOTAL UNITS"));

  // Line Items
  lineItems.forEach((item, i) => {
    const { orderItem, fabricSwatchCode, fabricColorCode, sizes, extras, overrideStyleCode } = item;
    const total = sizeTotal(sizes, extras);
    const combinedSizes = SIZE_KEYS.map((k) => {
      const base = parseInt(sizes[k]) || 0;
      const extra = parseInt(extras[k]) || 0;
      return base + extra > 0 ? String(base + extra) : "";
    });

    const styleCodeToUse = overrideStyleCode || orderItem.styleCode;
    const itemName = orderItem.orderName ?? (styleCodeToUse ? `${styleCodeToUse}${orderItem.color ? ` - ${orderItem.color}` : ""}` : "");

    lines.push(row(
      String(i + 1),
      orderItem.orderItemId,
      itemName,
      fabricSwatchCode,
      fabricColorCode,
      supplier?.name ?? "",
      orderItem.printType ?? "",
      orderItem.decoratingMethods ?? "",
      ...combinedSizes,
      String(total)
    ));
  });

  // Add empty row for totals if needed
  lines.push(row(""));
  lines.push(row(""));
  lines.push(row(""));

  // Notes Section
  lines.push(row("NOTES FROM FRESH PRINTS"));
  lines.push(row("- The PO is for making the garment and printing the design on them."));
  lines.push(row("- We'll need pre production images for this before proceeding with mass production."));
  lines.push(row("- Print type is listed above."));
  lines.push(row("- Please send the tracking when the order ships out."));
  lines.push(row("- Please Blind ship this order."));

  return lines.join("\n");
}

function SizeInputRow({
  label,
  sizes,
  onChange,
  highlight,
  maxPerSize,
}: {
  label: string;
  sizes: Sizes;
  onChange: (sizes: Sizes) => void;
  highlight?: boolean;
  maxPerSize?: Record<keyof Sizes, number>;
}) {
  return (
    <tr className={highlight ? "bg-blue-50" : ""}>
      <td className="text-xs text-gray-500 pr-2 py-0.5 whitespace-nowrap">{label}</td>
      {SIZE_KEYS.map((k) => {
        const max = maxPerSize?.[k];
        const currentValue = parseInt(sizes[k]) || 0;
        const isExceeded = max !== undefined && currentValue > max;
        return (
          <td key={k} className="px-0.5 py-0.5">
            <input
              type="number"
              min="0"
              max={max !== undefined ? String(max) : undefined}
              value={sizes[k]}
              onChange={(e) => {
                const val = e.target.value === "" ? "" : parseInt(e.target.value) || 0;
                if (max === undefined || val === "" || val <= max) {
                  onChange({ ...sizes, [k]: e.target.value });
                }
              }}
              placeholder="—"
              className={`w-12 text-xs text-center border rounded px-1 py-0.5 focus:outline-none tabular-nums ${
                isExceeded
                  ? "border-red-500 bg-red-50 text-red-700 focus:border-red-700"
                  : "border-gray-200 focus:border-gray-500"
              }`}
              title={max !== undefined ? `Max: ${max} (5% of order qty)` : undefined}
            />
          </td>
        );
      })}
    </tr>
  );
}

type POSummaryModalProps = {
  poNumber: string;
  poDate: string;
  deliveryDate: string;
  supplierShipDate: string;
  shippingMethod: string;
  clientName: string;
  needsTestPrint: boolean;
  testPrintDate: string;
  supplier: Supplier | null;
  lineItems: LineItem[];
  onConfirm: (exportFormat: "pdf" | "csv") => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
};

function POSummaryModal({
  poNumber,
  poDate,
  deliveryDate,
  supplierShipDate,
  shippingMethod,
  clientName,
  needsTestPrint,
  testPrintDate,
  supplier,
  lineItems,
  onConfirm,
  onCancel,
  isLoading,
}: POSummaryModalProps) {
  const fmtDate = (d: string) => {
    if (!d) return "—";
    try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-lg">
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Review PO Summary</h2>
            <p className="text-sm text-gray-500 mt-1">Verify details before saving to ERP</p>
          </div>

          <div className="bg-gray-50 rounded p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 font-medium">PO Number</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{poNumber}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">PO Date</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{fmtDate(poDate)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">In-Hands Date</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{fmtDate(deliveryDate)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Supplier Ship Date</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{fmtDate(supplierShipDate)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Shipping Method</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{shippingMethod}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Supplier</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{supplier?.name ?? "—"}</p>
              </div>
              {needsTestPrint && (
                <div>
                  <p className="text-xs text-gray-500 font-medium">Test Print Date</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">{fmtDate(testPrintDate)}</p>
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <p className="text-xs text-gray-500 font-medium mb-2">Order Items ({lineItems.length})</p>
              <div className="space-y-1">
                {lineItems.map((item) => (
                  <div key={item.orderItem.id} className="text-sm text-gray-700 flex justify-between">
                    <span>{item.orderItem.orderName || item.orderItem.styleCode}</span>
                    <span className="text-gray-500">{sizeTotal(item.sizes, item.extras)} units</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-sm text-gray-600">These details will be saved to the ERP when you confirm.</p>
            <div className="flex gap-3">
              <button
                onClick={() => onConfirm("pdf")}
                disabled={isLoading}
                className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isLoading ? "Saving…" : "✓ Save & Download PDF"}
              </button>
              <button
                onClick={() => onConfirm("csv")}
                disabled={isLoading}
                className="flex-1 bg-gray-900 text-white px-4 py-2.5 rounded font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {isLoading ? "Saving…" : "✓ Save & Download CSV"}
              </button>
              <button
                onClick={onCancel}
                disabled={isLoading}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function POBuilder() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [nominatedSuppliers, setNominatedSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [poNumber, setPoNumber] = useState("");
  const [poDate, setPoDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [supplierShipDate, setSupplierShipDate] = useState("");
  const [shippingMethod, setShippingMethod] = useState("DDP Sea");
  const [clientName, setClientName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [orderDueDate, setOrderDueDate] = useState("");
  const [orderInstructions, setOrderInstructions] = useState("");
  const [needsTestPrint, setNeedsTestPrint] = useState(false);
  const [testPrintDate, setTestPrintDate] = useState("");
  const [validationError, setValidationError] = useState("");

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<OrderItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const [showSummary, setShowSummary] = useState(false);
  const [summaryExportFormat, setSummaryExportFormat] = useState<"pdf" | "csv">("pdf");
  const [saving, setSaving] = useState(false);

  const [overrideModes, setOverrideModes] = useState<Record<number, Set<string>>>({});
  const [fabricCodesCache, setFabricCodesCache] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    fetch("/api/po-builder/suppliers").then((r) => r.json()).then(setSuppliers);
  }, []);

  useEffect(() => {
    if (suppliers.length === 0) return;

    fetch("/api/orders?column=unassigned&page=1&limit=1000")
      .then((r) => r.json())
      .then((data) => {
        const items = data.items ?? [];
        const nominatedSupplierIds = new Set<number>();
        items.forEach((item: OrderItem) => {
          if (item.nominatedSupplierId) nominatedSupplierIds.add(item.nominatedSupplierId);
        });
        const nominated = Array.from(nominatedSupplierIds)
          .map((id) => suppliers.find((s) => s.id === id))
          .filter(Boolean) as Supplier[];
        setNominatedSuppliers(nominated);
      })
      .catch(console.error);
  }, [suppliers]);

  const searchOrders = useCallback(async (q: string, nominatedSupplierId: string) => {
    setSearching(true);
    const params = new URLSearchParams({ limit: "50", column: "unassigned" } as any);
    if (q) params.set("search", q);
    if (nominatedSupplierId) params.set("nominatedSupplierId", nominatedSupplierId);
    const res = await fetch(`/api/orders?${params}`);
    if (res.ok) {
      const data = await res.json();
      setSearchResults(data.items ?? []);
    }
    setSearching(false);
  }, []);

  useEffect(() => {
    if (search.length >= 2 || selectedSupplierId) {
      const t = setTimeout(() => searchOrders(search, selectedSupplierId), 300);
      return () => clearTimeout(t);
    } else {
      setSearchResults([]);
    }
  }, [search, selectedSupplierId, searchOrders]);

  const fetchFabricsForStyle = useCallback(async (styleCode: string, lineItemId: number) => {
    if (!styleCode) return;

    const cached = fabricCodesCache.get(styleCode);
    if (cached) {
      if (cached.length === 1) {
        selectFabric(lineItemId, cached[0]);
      }
      return;
    }

    try {
      const res = await fetch(`/api/po-builder/fabrics?styleCode=${encodeURIComponent(styleCode)}`);
      if (res.ok) {
        const data = await res.json();
        const codes: string[] = data.fabricCodes ?? [];
        setFabricCodesCache((prev) => new Map(prev).set(styleCode, codes));

        setLineItems((prev) =>
          prev.map((li) =>
            li.orderItem.id === lineItemId ? { ...li, availableFabricCodes: codes } : li
          )
        );

        if (codes.length === 1) {
          selectFabric(lineItemId, codes[0]);
        }
      }
    } catch (error) {
      console.error("Error fetching fabrics:", error);
    }
  }, [fabricCodesCache]);

  const selectFabric = useCallback(async (lineItemId: number, fabricCode: string) => {
    setLineItems((prev) =>
      prev.map((li) =>
        li.orderItem.id === lineItemId
          ? { ...li, selectedFabricCode: fabricCode, fabricSwatchCode: fabricCode, fabricColorCode: "", fabricColorOptions: [] }
          : li
      )
    );

    try {
      const res = await fetch(`/api/po-builder/fabric-colors?fabricCode=${encodeURIComponent(fabricCode)}`);
      if (res.ok) {
        const data = await res.json();
        const colors: FabricColorOption[] = (data.colors ?? []).map((c: any) => ({
          colorCode: c.colorCode,
          supplier: c.supplier,
        }));

        setLineItems((prev) =>
          prev.map((li) =>
            li.orderItem.id === lineItemId ? { ...li, fabricColorOptions: colors } : li
          )
        );
      }
    } catch (error) {
      console.error("Error fetching fabric colors:", error);
    }
  }, []);

  const addItem = useCallback(async (orderItem: OrderItem) => {
    if (lineItems.some((li) => li.orderItem.id === orderItem.id)) return;

    setValidationError("");

    const newLineItems = [
      ...lineItems,
      {
        orderItem,
        fabricSwatchCode: "",
        fabricColorCode: orderItem.color ?? "",
        fabricColorOptions: [],
        availableFabricCodes: [],
        selectedFabricCode: "",
        sizes: { ...EMPTY_SIZES },
        extras: { ...EMPTY_SIZES },
      },
    ];

    const nominated_suppliers_set = new Set(newLineItems.map((li) => li.orderItem.nominatedSupplierId));
    if (nominated_suppliers_set.size > 1) {
      setValidationError("Multiple Nominated Suppliers selection, please check the Board and Try Again");
      return;
    }

    if (newLineItems.some((li) => li.orderItem.supplierId)) {
      setValidationError("Cannot add assigned orders to PO. Only unassigned orders can be included.");
      return;
    }

    const clientNames = new Set(newLineItems.map((li) => li.orderItem.clientName));
    const deliveryAddresses = new Set(newLineItems.map((li) => li.orderItem.deliveryAddress));
    if (clientNames.size > 1 || deliveryAddresses.size > 1) {
      setValidationError("Client Name and Delivery Address do not match, please check the Order Number and Try Again");
      return;
    }

    if (newLineItems.length === 1) {
      if (orderItem.nominatedSupplierId) {
        setSelectedSupplierId(String(orderItem.nominatedSupplierId));
      }
      if (orderItem.clientName) {
        setClientName(orderItem.clientName);
      }
      if (orderItem.deliveryAddress) {
        setDeliveryAddress(orderItem.deliveryAddress);
      }
      if (orderItem.dueDate) {
        setOrderDueDate(orderItem.dueDate);
      }
      if (orderItem.orderId) {
        setPoNumber(orderItem.orderId);
      }
    }

    setLineItems(newLineItems);

    if (orderItem.styleCode) {
      fetchFabricsForStyle(orderItem.styleCode, orderItem.id);
    }
  }, [lineItems, fetchFabricsForStyle]);

  function removeItem(id: number) {
    setLineItems((prev) => prev.filter((li) => li.orderItem.id !== id));
    setValidationError("");
  }

  function updateLineItem(id: number, patch: Partial<Omit<LineItem, "orderItem">>) {
    setLineItems((prev) =>
      prev.map((li) => (li.orderItem.id === id ? { ...li, ...patch } : li))
    );
  }

  function toggleOverrideMode(id: number, fieldName: string) {
    setOverrideModes((prev) => {
      const current = prev[id] || new Set<string>();
      const updated = new Set(current);
      if (updated.has(fieldName)) {
        updated.delete(fieldName);
      } else {
        updated.add(fieldName);
      }
      return { ...prev, [id]: updated };
    });
  }

  function isInOverrideMode(id: number, fieldName: string): boolean {
    return overrideModes[id]?.has(fieldName) ?? false;
  }

  function resetBuilder() {
    setLineItems([]);
    setPoNumber("");
    setPoDate(format(new Date(), "yyyy-MM-dd"));
    setDeliveryDate("");
    setSupplierShipDate("");
    setShippingMethod("DDP Sea");
    setClientName("");
    setDeliveryAddress("");
    setOrderDueDate("");
    setOrderInstructions("");
    setNeedsTestPrint(false);
    setTestPrintDate("");
    setValidationError("");
    setSearch("");
    setSearchResults([]);
    setOverrideModes({});
  }

  async function saveAndExport(format: "pdf" | "csv") {
    try {
      setSaving(true);
      const orderItemIds = lineItems.map((li) => li.orderItem.id);

      if (!lineItems.length) {
        throw new Error("No items selected");
      }

      const nominatedSupplierId = lineItems[0]?.orderItem.nominatedSupplierId;
      if (!nominatedSupplierId) {
        throw new Error("First item has no nominated supplier. Please select items with a nominated supplier.");
      }

      const allHaveSameSupplier = lineItems.every(li => li.orderItem.nominatedSupplierId === nominatedSupplierId);
      if (!allHaveSameSupplier) {
        throw new Error("All items must have the same nominated supplier. Found multiple nominated suppliers.");
      }

      const shouldTestPrint = needsTestPrint || lineItems.some((li) => li.orderItem.requiresTestPrint);
      const productionStage = shouldTestPrint ? "sample_production" : "fabric_sourcing";
      const finalTestPrintDate = needsTestPrint && testPrintDate
        ? new Date(testPrintDate).toISOString()
        : undefined;

      const res = await fetch("/api/po-builder/assign-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderItemIds,
          supplierId: nominatedSupplierId,
          productionStage,
          inHandsDate: deliveryDate ? new Date(deliveryDate).toISOString() : undefined,
          supplierShipDate: supplierShipDate ? new Date(supplierShipDate).toISOString() : undefined,
          shippingMethod,
          testPrintDate: finalTestPrintDate,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("API error response:", errData);
        throw new Error(errData.error || `API error: ${res.status}`);
      }

      const result = await res.json();
      console.log("PO details saved:", result);
      toast.success("PO details saved to ERP");

      // Now download the file
      if (format === "pdf") {
        await downloadPDF();
      } else {
        await downloadCSV();
      }

      setShowSummary(false);
    } catch (error) {
      console.error("Error saving PO:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save PO");
    } finally {
      setSaving(false);
    }
  }

  async function downloadCSV() {
    try {
      const supplier = suppliers.find((s) => s.id === parseInt(selectedSupplierId)) ?? null;
      const csv = generateCSV(poNumber, poDate, deliveryDate, shippingMethod, clientName, deliveryAddress, supplier, lineItems);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PO-${poNumber || "draft"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading CSV:", error);
      toast.error("Failed to download CSV");
    }
  }

  async function downloadPDF() {
    try {
      const nominatedSupplierId = lineItems[0]?.orderItem.nominatedSupplierId;
      const supplier = nominatedSupplierId ? suppliers.find((s) => s.id === nominatedSupplierId) ?? null : null;
      const processedItems = lineItems.map((li) => ({
        orderItemId: li.orderItem.orderItemId,
        orderName: li.orderItem.orderName,
        styleCode: li.overrideStyleCode || li.orderItem.styleCode,
        fabricSwatchCode: li.fabricSwatchCode,
        fabricColorCode: li.fabricColorCode,
        printType: li.orderItem.printType,
        decoratingMethods: li.orderItem.decoratingMethods,
        sizes: li.sizes,
        extras: li.extras,
      }));

      const res = await fetch("/api/po-builder/export-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poNumber,
          poDate,
          deliveryDate,
          shippingMethod,
          clientName,
          deliveryAddress,
          supplier,
          lineItems: processedItems,
          orderInstructions,
        }),
      });

      if (res.ok) {
        const html = await res.text();
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const newWindow = window.open(url);
        if (newWindow) {
          setTimeout(() => {
            newWindow.print();
          }, 500);
        } else {
          toast.error("Pop-up blocked. Please allow pop-ups and try again.");
        }
      } else {
        toast.error("Failed to generate PO");
      }
    } catch (error) {
      console.error("PO export error:", error);
      toast.error("Error generating PO");
    }
  }

  function handleExportClick(format: "pdf" | "csv") {
    if (!deliveryDate) {
      toast.error("Please set the In-Hands Date");
      return;
    }
    if (!supplierShipDate) {
      toast.error("Please set the Supplier Ship Date");
      return;
    }
    if (needsTestPrint && !testPrintDate) {
      toast.error("Please set the Test Print Date");
      return;
    }
    setSummaryExportFormat(format);
    setShowSummary(true);
  }

  const selectedSupplier = suppliers.find((s) => s.id === parseInt(selectedSupplierId));
  const selectedIds = new Set(lineItems.map((li) => li.orderItem.id));

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">PO Builder</h1>
          <p className="text-sm text-gray-500 mt-0.5">Build a purchase order from order items</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetBuilder}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={() => handleExportClick("pdf")}
            disabled={lineItems.length === 0 || !poNumber}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            Export PDF
          </button>
          <button
            onClick={() => handleExportClick("csv")}
            disabled={lineItems.length === 0 || !poNumber}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* PO Header */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">PO Details</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs text-gray-500 font-medium">PO Number</label>
            <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="e.g. 181451"
              className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">PO Date</label>
            <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)}
              className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">In-Hands Date</label>
            <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)}
              className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Supplier Ship Date</label>
            <input type="date" value={supplierShipDate} onChange={(e) => setSupplierShipDate(e.target.value)}
              className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Shipping Method</label>
            <select value={shippingMethod} onChange={(e) => setShippingMethod(e.target.value)}
              className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700 bg-white">
              <option>DDP Sea</option>
              <option>DDP Air</option>
              <option>FOB Sea</option>
              <option>FOB Air</option>
              <option>EXW</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Client Name</label>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Carly Jordan"
              className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700" />
            {orderDueDate && lineItems.length > 0 && (
              <div className="mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                <div>
                  <span className="font-medium">Due Date on v3:</span> {new Date(orderDueDate).toLocaleDateString()}
                </div>
                {lineItems[0]?.orderItem.orderId && (
                  <a href={`https://v3.freshprints.com/dashboard/order/${lineItems[0].orderItem.orderId}`} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 hover:underline inline-block mt-1">
                    View Order {lineItems[0].orderItem.orderId} ↗
                  </a>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Delivery Address</label>
            <textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)}
              rows={2} placeholder="Street, City, State ZIP"
              className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700 resize-none" />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <label className="text-xs text-gray-500 font-medium">Order Instructions</label>
            <textarea value={orderInstructions} onChange={(e) => setOrderInstructions(e.target.value)}
              rows={3} placeholder="Any special instructions for the supplier…"
              className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700 resize-none" />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={needsTestPrint} onChange={(e) => setNeedsTestPrint(e.target.checked)}
                className="rounded border-gray-300" />
              <span className="text-sm font-medium text-gray-700">Need Test Print</span>
            </label>
          </div>
          {needsTestPrint && (
            <div>
              <label className="text-xs text-gray-500 font-medium">Test Print Date</label>
              <input type="date" value={testPrintDate} onChange={(e) => setTestPrintDate(e.target.value)}
                className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700" />
            </div>
          )}
        </div>

        {/* Add Order Items Section */}
        <div className="border-t border-gray-200 pt-6 mt-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Add Order Items</h3>
            <p className="text-xs text-gray-600 italic mb-4">You can only create POs for unassigned order items with nominated supplier</p>
          </div>

          <div className="flex gap-3 items-end">
            <div className="w-64">
              <label className="text-xs text-gray-500 font-medium">Nominated Supplier</label>
              <select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700 bg-white">
                <option value="">Select supplier...</option>
                {nominatedSuppliers.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.nickname ?? s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 font-medium">Search orders</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Order ID, style, color, name…"
                className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700" />
            </div>
          </div>

          {validationError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {validationError}
            </div>
          )}

          {(searchResults.length > 0 || searching) && (
            <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-64 overflow-y-auto">
              {searching && <p className="text-xs text-gray-400 p-3">Searching…</p>}
              {searchResults.map((item) => {
                const already = selectedIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => addItem(item)}
                    disabled={already}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default transition-colors"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <span className="text-xs font-mono text-gray-500">{item.orderItemId}</span>
                        {" "}
                        <span className="text-sm text-gray-900">{item.orderName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.styleCode && <span className="text-xs text-gray-400">{item.styleCode}</span>}
                        {item.color && <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{item.color}</span>}
                        {already && <span className="text-xs text-green-600">Added</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Line Items */}
      {lineItems.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Order Lines ({lineItems.length})
          </h2>
          {lineItems.map((li, i) => (
            <div key={li.orderItem.id} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-400">#{i + 1}</span>
                    <span className="text-sm font-semibold text-gray-900">{li.orderItem.orderName}</span>
                    <span className="text-xs font-mono text-gray-400">{li.orderItem.orderItemId}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {isInOverrideMode(li.orderItem.id, "styleCode") ? (
                      <input
                        type="text"
                        value={li.overrideStyleCode || li.orderItem.styleCode || ""}
                        onChange={(e) => updateLineItem(li.orderItem.id, { overrideStyleCode: e.target.value })}
                        placeholder="e.g. SS2024-COLLAB"
                        className="text-xs border border-blue-300 rounded px-2 py-1 focus:outline-none focus:border-blue-600 bg-blue-50"
                      />
                    ) : (
                      <div className="text-xs text-gray-600">
                        <span className="font-medium">Style:</span> {li.overrideStyleCode || li.orderItem.styleCode || "—"}
                      </div>
                    )}
                    <button
                      onClick={() => toggleOverrideMode(li.orderItem.id, "styleCode")}
                      className="text-gray-400 hover:text-blue-600 transition-colors shrink-0"
                      title="Toggle edit mode"
                    >
                      ✏️
                    </button>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    {li.orderItem.printType && <span>Print: {li.orderItem.printType}</span>}
                    {li.orderItem.decoratingMethods && <span>Decoration: {li.orderItem.decoratingMethods}</span>}
                  </div>
                </div>
                <button onClick={() => removeItem(li.orderItem.id)} className="text-xs text-gray-400 hover:text-red-600 shrink-0">
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Fabric Code</label>
                  {li.availableFabricCodes.length > 0 ? (
                    <select
                      value={li.selectedFabricCode}
                      onChange={(e) => selectFabric(li.orderItem.id, e.target.value)}
                      className="mt-1 w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700 bg-white"
                    >
                      <option value="">Select a fabric...</option>
                      {li.availableFabricCodes.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-1 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                      No fabrics found for this style. Use the swatch code field below to enter manually.
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs text-gray-500 font-medium">Fabric Swatch Code</label>
                    <button
                      onClick={() => toggleOverrideMode(li.orderItem.id, "fabricSwatchCode")}
                      className={`text-sm transition-colors ${
                        isInOverrideMode(li.orderItem.id, "fabricSwatchCode")
                          ? "text-blue-600 hover:text-blue-700"
                          : "text-gray-400 hover:text-blue-600"
                      }`}
                      title="Toggle edit mode"
                    >
                      ✏️
                    </button>
                  </div>
                  <input
                    value={li.fabricSwatchCode}
                    onChange={(e) => updateLineItem(li.orderItem.id, { fabricSwatchCode: e.target.value })}
                    placeholder="e.g. Taisum #0690"
                    disabled={!isInOverrideMode(li.orderItem.id, "fabricSwatchCode")}
                    className={`mt-1 w-full text-xs border rounded px-2 py-1.5 focus:outline-none ${
                      isInOverrideMode(li.orderItem.id, "fabricSwatchCode")
                        ? "border-blue-300 bg-blue-50 focus:border-blue-600"
                        : "border-gray-300 bg-gray-50 focus:border-gray-700"
                    } disabled:text-gray-500`}
                  />
                </div>
                <div>
                  <div className="bg-blue-50 border border-blue-200 rounded px-2 py-1.5 mb-2">
                    <p className="text-xs text-blue-600 font-medium">Color listed on V4</p>
                    <p className="text-xs text-blue-900 font-semibold mt-0.5">{li.orderItem.color ?? "—"}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs text-gray-500 font-medium">Fabric Color Code</label>
                    <button
                      onClick={() => toggleOverrideMode(li.orderItem.id, "fabricColorCode")}
                      className={`text-sm transition-colors ${
                        isInOverrideMode(li.orderItem.id, "fabricColorCode")
                          ? "text-blue-600 hover:text-blue-700"
                          : "text-gray-400 hover:text-blue-600"
                      }`}
                      title="Toggle between dropdown and free-text"
                    >
                      ✏️
                    </button>
                  </div>
                  {isInOverrideMode(li.orderItem.id, "fabricColorCode") ? (
                    <input
                      value={li.fabricColorCode}
                      onChange={(e) => updateLineItem(li.orderItem.id, { fabricColorCode: e.target.value })}
                      placeholder="e.g. MTO color - Black - #1"
                      className="mt-1 w-full text-xs border border-blue-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-600 bg-blue-50"
                    />
                  ) : li.selectedFabricCode && li.fabricColorOptions.length > 0 ? (
                    <select
                      value={li.fabricColorCode}
                      onChange={(e) => updateLineItem(li.orderItem.id, { fabricColorCode: e.target.value })}
                      className="mt-1 w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700 bg-white"
                    >
                      <option value="">Select a color...</option>
                      {li.fabricColorOptions.map((color, idx) => (
                        <option key={idx} value={color.colorCode}>
                          {color.colorCode}
                        </option>
                      ))}
                    </select>
                  ) : li.selectedFabricCode ? (
                    <div className="mt-1 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                      Loading colors for {li.selectedFabricCode}...
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                      Select a fabric first to see available colors
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr>
                      <th className="w-16" />
                      {SIZE_KEYS.map((k) => (
                        <th key={k} className="w-14 text-center text-gray-400 font-medium pb-1 px-0.5">
                          {SIZE_LABELS[k]}
                        </th>
                      ))}
                      <th className="text-center text-gray-400 font-medium pb-1 px-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SizeInputRow
                      label="Qty"
                      sizes={li.sizes}
                      onChange={(sizes) => updateLineItem(li.orderItem.id, { sizes })}
                    />
                    {(() => {
                      const maxExtrasPerSize: Record<keyof Sizes, number> = {} as Record<keyof Sizes, number>;
                      SIZE_KEYS.forEach((k) => {
                        const qtyForSize = parseInt(li.sizes[k]) || 0;
                        maxExtrasPerSize[k] = Math.ceil(qtyForSize * 0.05);
                      });
                      return (
                        <SizeInputRow
                          label="Extras"
                          sizes={li.extras}
                          onChange={(extras) => updateLineItem(li.orderItem.id, { extras })}
                          highlight
                          maxPerSize={maxExtrasPerSize}
                        />
                      );
                    })()}
                    <tr className="border-t border-gray-100">
                      <td className="text-xs font-semibold text-gray-700 pr-2 py-1">Total</td>
                      {SIZE_KEYS.map((k) => {
                        const t = (parseInt(li.sizes[k]) || 0) + (parseInt(li.extras[k]) || 0);
                        return (
                          <td key={k} className="text-center text-xs font-semibold text-gray-800 px-0.5">
                            {t > 0 ? t : "—"}
                          </td>
                        );
                      })}
                      <td className="text-center text-xs font-bold text-gray-900 px-2">
                        {sizeTotal(li.sizes, li.extras)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => handleExportClick("pdf")}
              disabled={!poNumber}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {poNumber ? `Export PO-${poNumber}.pdf` : "Export PDF (enter PO # first)"}
            </button>
            <button
              onClick={() => handleExportClick("csv")}
              disabled={!poNumber}
              className="rounded-md bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              {poNumber ? `Export PO-${poNumber}.csv` : "Export CSV (enter PO # first)"}
            </button>
          </div>
        </section>
      )}

      {showSummary && (
        <POSummaryModal
          poNumber={poNumber}
          poDate={poDate}
          deliveryDate={deliveryDate}
          supplierShipDate={supplierShipDate}
          shippingMethod={shippingMethod}
          clientName={clientName}
          needsTestPrint={needsTestPrint}
          testPrintDate={testPrintDate}
          supplier={selectedSupplier ?? null}
          lineItems={lineItems}
          onConfirm={(format) => saveAndExport(format)}
          onCancel={() => setShowSummary(false)}
          isLoading={saving}
        />
      )}
    </div>
  );
}
