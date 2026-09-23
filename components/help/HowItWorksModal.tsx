"use client";

import { useEffect, useRef } from "react";

/**
 * The shell every "How does this work?" panel opens in, plus the handful of
 * primitives the panels are written out of.
 *
 * One dialog, one set of building blocks, nine sets of words. The capacity
 * panel came first and was self-contained; the moment there were nine of them
 * the escape handling, the focus move and the scroll behaviour were going to be
 * copied nine times and drift, so they live here and the topic files hold
 * nothing but content.
 *
 * All of it is deliberately self-contained rather than an iframe of a shared
 * write-up elsewhere: these have to open for every internal user inside the
 * ERP, with no dependency on an external page or on who has been granted
 * access to it.
 *
 * House style for the topics, worth keeping to:
 *  - answer "what is this tab for" in one sentence before anything else
 *  - name things by what they decide, not by how they are computed
 *  - spend the space on what would otherwise be learned by getting it wrong
 */

/** A paragraph. The panels are almost entirely these, so it is worth a name. */
export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-600 leading-relaxed">{children}</p>;
}

/** Emphasis inside a P — a term the reader should carry away. */
export function B({ children }: { children: React.ReactNode }) {
  return <strong className="text-gray-900">{children}</strong>;
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </section>
  );
}

/**
 * A named concept: what it is, the question it answers, and an example.
 *
 * `question` is the part that does the work. A definition tells you what a
 * number is; the question tells you when to look at it.
 */
export function Card({
  name,
  question,
  children,
  example,
}: {
  name: string;
  question?: string;
  children: React.ReactNode;
  example?: string;
}) {
  return (
    <div className="rounded border border-gray-200 p-3 space-y-1.5">
      <p className="text-xs font-bold text-gray-900">{name}</p>
      {question && (
        <p className="text-xs text-gray-900 italic border-l-2 border-gray-300 pl-2">{question}</p>
      )}
      <div className="space-y-1.5">{children}</div>
      {example && <p className="text-xs text-gray-500 font-mono tabular-nums">{example}</p>}
    </div>
  );
}

/**
 * The thing that bites people.
 *
 * `warn` for "this will surprise you", `crit` for "this destroys data", `ok`
 * for a reassurance worth making explicit. Used sparingly — a panel where
 * everything is highlighted highlights nothing.
 */
export function Callout({
  tone = "warn",
  title,
  children,
}: {
  tone?: "ok" | "warn" | "crit";
  title?: string;
  children: React.ReactNode;
}) {
  const box = {
    ok: "bg-green-50 border-green-200",
    warn: "bg-amber-50 border-amber-200",
    crit: "bg-red-50 border-red-200",
  }[tone];
  const heading = {
    ok: "text-green-800",
    warn: "text-amber-800",
    crit: "text-red-800",
  }[tone];

  return (
    <div className={`rounded border p-3 space-y-1.5 ${box}`}>
      {title && <p className={`text-xs font-bold ${heading}`}>{title}</p>}
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

/** An ordered walk-through. Numbered because the order is the point. */
export function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-xs text-gray-600 leading-relaxed">
          <span className="shrink-0 w-4 h-4 mt-0.5 rounded-full bg-gray-900 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

/** A term-and-meaning list, for roles, statuses, columns and the like. */
export function Defs({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="space-y-1.5">
      {items.map(([term, meaning], i) => (
        <div key={i} className="grid grid-cols-[112px_1fr] gap-3 items-baseline">
          <dt className="text-xs font-semibold text-gray-900">{term}</dt>
          <dd className="text-xs text-gray-600 leading-relaxed">{meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A formula or literal value, shown as the tool shows it. */
export function Literal({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-xs text-gray-700 tabular-nums">
      {children}
    </div>
  );
}

/** The closing line of a panel: the one thing to remember, set apart. */
export function Footnote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-200 pt-4">{children}</p>
  );
}

export function HowItWorksModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and focus starts inside the dialog rather than wherever the
  // page happened to leave it.
  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
          <div>
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1 rounded focus:outline-none focus:ring-2 focus:ring-gray-400"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 text-sm text-gray-700">{children}</div>
      </div>
    </div>
  );
}
