const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-gray-100 text-gray-700" },
  assigned: { label: "Assigned", className: "bg-blue-100 text-blue-700" },
  in_sampling: { label: "In Sampling", className: "bg-purple-100 text-purple-700" },
  in_production: { label: "In Production", className: "bg-yellow-100 text-yellow-800" },
  qc: { label: "QC", className: "bg-orange-100 text-orange-700" },
  shipped: { label: "Shipped", className: "bg-green-100 text-green-700" },
  completed: { label: "Completed", className: "bg-green-200 text-green-800" },
  delayed: { label: "Delayed", className: "bg-red-100 text-red-700" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${config.className}`}
    >
      {config.label}
    </span>
  );
}

export const ALL_STATUSES = Object.entries(STATUS_CONFIG).map(([value, { label }]) => ({
  value,
  label,
}));
