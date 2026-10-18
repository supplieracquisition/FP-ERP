"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A filter that takes several values at once.
 *
 * Built rather than pulled in: the app has no combobox library, and a native
 * `<select multiple>` is the wrong control here — it renders as an always-open
 * scrolling list box, needs ctrl/cmd-click to add a second value (which nobody
 * discovers), and loses the selection on a stray click. This is a button that
 * opens a list of checkboxes, which is what people expect a multi-value filter
 * to be.
 *
 * Deliberately uncontrolled about its own open state and controlled about the
 * selection: the parent owns `value` because the selection is a filter, and
 * filters belong with the query that uses them.
 */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  className = "",
}: {
  /** Shown when nothing is picked, as "<label>: All". */
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape. Both, because either alone leaves a
  // way to have the panel stuck open over the rest of the filter bar.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  // One pick names itself; several are counted. Listing three manufacturers in
  // a button that has to sit in a filter bar just truncates them all.
  const summary =
    value.length === 0
      ? `${label}: All`
      : value.length === 1
      ? (options.find((o) => o.value === value[0])?.label ?? `${label}: 1`)
      : `${label}: ${value.length} selected`;

  const active = value.length > 0;

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`rounded-md border px-3 py-1.5 text-xs font-medium bg-white transition-colors focus:outline-none focus:border-gray-700 ${
          active
            ? "border-gray-800 text-gray-900 font-bold bg-gray-50"
            : "border-gray-300 text-gray-500"
        }`}
      >
        {summary}
        <span className="ml-1.5 text-gray-400">▾</span>
      </button>

      {/* The panel is w-80 so a full factory name fits: "Dongguan Maoyuan
          Clothing Co., Ltd." and "Dongguan Qianlong Clothing Co., Ltd." differ
          only in the middle, and a narrower panel truncates them to the same
          string. */}
      {open && (
        <div className="absolute z-20 mt-1 w-80 max-h-72 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg py-1">
          {active && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 border-b border-gray-100"
            >
              Clear selection
            </button>
          )}
          {options.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={value.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="rounded shrink-0"
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
