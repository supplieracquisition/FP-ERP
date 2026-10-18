"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * A single-choice dropdown you can type into.
 *
 * A native <select> has no search. The browser's only concession is
 * type-ahead, which matches from the START of an option and resets after a
 * pause — useless against a list of several hundred fabric codes where the
 * distinguishing part of the string is in the middle. The result was people
 * scrolling the list by hand every time.
 *
 * So: a button that opens a filter box over the options. Substring match, not
 * prefix — "0690" should find "Taisum #0690", which is the whole point.
 *
 * Deliberately NOT a free-text field. The value still has to be one of the
 * options, because downstream these codes are looked up to fetch colours and
 * are printed onto a PO. Where free text IS wanted the PO Builder already has
 * its pencil toggle, and that stays as it is.
 */
export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Select…",
  emptyText = "No matches",
  className = "",
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Opening starts clean: a stale query from last time would hide the options
  // and read as "this fabric has no colours".
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[highlight];
      if (pick) choose(pick.value);
    }
  }

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="mt-1 w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-left flex items-center justify-between gap-2 focus:outline-none focus:border-gray-700"
      >
        <span className={`truncate ${selectedLabel ? "text-gray-900" : "text-gray-400"}`}>
          {selectedLabel || placeholder}
        </span>
        <span className="text-gray-400 shrink-0">▾</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Type to search…"
            className="w-full text-xs border-b border-gray-200 px-2 py-1.5 focus:outline-none"
          />

          <div ref={listRef} className="max-h-56 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-xs text-gray-400">{emptyText}</div>
            ) : (
              filtered.map((o, i) => (
                <button
                  // Index-keyed, NOT keyed on the value. These lists contain
                  // genuine duplicates — a fabric's colour list repeats the
                  // same code several times — and duplicate React keys break
                  // reconciliation: typing a query updated the match counter
                  // but left every filtered-out row on screen, so the search
                  // looked like it did nothing. The list is re-derived whole
                  // on each query, so the index is a safe key here.
                  key={`${i}-${o.value}`}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => choose(o.value)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full text-left px-2 py-1.5 text-xs truncate ${
                    i === highlight ? "bg-gray-100" : ""
                  } ${o.value === value ? "font-semibold text-gray-900" : "text-gray-700"}`}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>

          {filtered.length > 0 && (
            <div className="border-t border-gray-100 px-2 py-1 text-[10px] text-gray-400">
              {filtered.length} of {options.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
