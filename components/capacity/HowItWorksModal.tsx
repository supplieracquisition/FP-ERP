"use client";

import { useEffect, useRef } from "react";

/**
 * The capacity board explained, for whoever is deciding where the next PO goes.
 *
 * Written for POCs rather than for engineers: it names Intake and Pipeline by
 * what they answer, not by how they are computed, and the 2x2 is the part that
 * actually changes a decision. The one idea worth carrying away is that the two
 * numbers can disagree, and that "intake high / pipeline fine" is the case where
 * the reassuring number is the misleading one.
 *
 * Deliberately self-contained rather than an iframe of the shared write-up: this
 * has to open for every internal user inside the ERP, with no dependency on an
 * external page or on who has been granted access to it.
 */

function Cell({
  tone,
  verdict,
  body,
  action,
}: {
  tone: "ok" | "warn" | "crit";
  verdict: string;
  body: string;
  action: string;
}) {
  const tones = {
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
    <div className={`rounded border p-3 space-y-1.5 ${tones}`}>
      <p className={`text-xs font-bold ${heading}`}>{verdict}</p>
      <p className="text-xs text-gray-600 leading-relaxed">{body}</p>
      <p className="text-xs text-gray-900">
        <span className="font-semibold uppercase tracking-wide text-[10px] text-gray-500 block">
          Do
        </span>
        {action}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </section>
  );
}

export function HowItWorksModal({ onClose }: { onClose: () => void }) {
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
      aria-label="How the capacity board works"
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
          <div>
            <h2 className="text-base font-bold text-gray-900">How the capacity board works</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Two numbers per manufacturer. They measure different things, and the
              disagreement is the useful part.
            </p>
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

        <div className="px-6 py-5 space-y-6 text-sm text-gray-700">

          <Section title="What this board is for">
            <p className="text-xs text-gray-600 leading-relaxed">
              It answers one question: <strong className="text-gray-900">where should the
              next PO go?</strong> Every manufacturer can only carry so much at a time, and
              the board shows how heavily each one is loaded, how fast work is arriving,
              and whether there is room for what you are about to send. It is a placement
              tool used before you commit, not a report on what already happened.
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">
              It reflects committed work only. An order appears the moment a printer is
              assigned to it and drops off the moment it ships. Orders still in the
              unassigned pool load nobody, and a nomination doesn&apos;t count either —
              only building the PO commits the work.
            </p>
          </Section>

          <Section title="The two numbers">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded border border-gray-200 p-3 space-y-1.5">
                <p className="text-xs font-bold text-gray-900">Intake</p>
                <p className="text-xs text-gray-900 italic border-l-2 border-gray-300 pl-2">
                  How much new work did I hand this factory this week?
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Orders where you assigned this printer in the last 7 days, against the
                  orders per week they can absorb.
                </p>
                <p className="text-xs text-gray-500 font-mono tabular-nums">
                  18/20 — you gave them 18, they can take 20.
                </p>
              </div>
              <div className="rounded border border-gray-200 p-3 space-y-1.5">
                <p className="text-xs font-bold text-gray-900">Pipeline</p>
                <p className="text-xs text-gray-900 italic border-l-2 border-gray-300 pl-2">
                  How much work is on their floor right now?
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Orders in production today — started, not yet shipped — against how many
                  they can have going at once.
                </p>
                <p className="text-xs text-gray-500 font-mono tabular-nums">
                  35/40 — 35 jobs on the floor, room for 40.
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              The difference is timing. An order you assign today that ships in six weeks
              is intake <em>now</em>, then sits in pipeline for the next six weeks. That
              gap is why there are two numbers: one figure can&apos;t tell a factory
              you&apos;ve just loaded up from one that&apos;s already jammed, and those
              call for opposite decisions.
            </p>
          </Section>

          <Section title="Reading them together">
            <div className="grid grid-cols-[64px_1fr_1fr] gap-2">
              <div />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 text-center self-end pb-1">
                Pipeline OK
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 text-center self-end pb-1">
                Pipeline high
              </p>

              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 self-center">
                Intake OK
              </p>
              <Cell tone="ok" verdict="Healthy" body="Steady work going in, floor comfortable."
                action="Place work here as normal." />
              <Cell tone="warn" verdict="Working it off"
                body="Floor is full, but you've already eased off. A backlog clearing itself."
                action="Hold. It recovers as jobs ship — adding more undoes that." />

              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 self-center">
                Intake high
              </p>
              <Cell tone="warn" verdict="Full soon"
                body="You've just handed them a lot and it hasn't reached the floor yet. Pipeline will climb in the coming days."
                action="Don't read the green as room. Slow down before it turns." />
              <Cell tone="crit" verdict="Overloaded"
                body="Full now, and still being fed. Ship dates here are at risk."
                action="Stop assigning. Move the next POs elsewhere." />
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              <strong className="text-gray-900">Full soon</strong> is the square worth
              learning. Pipeline still looks green, so nothing appears wrong — but the work
              is already committed and simply hasn&apos;t started. It&apos;s the one case
              where the reassuring number is the misleading one.
            </p>
          </Section>

          <Section title="Where the pipeline ceiling comes from">
            <p className="text-xs text-gray-600 leading-relaxed">
              You enter one figure per manufacturer: <strong className="text-gray-900">orders
              per week</strong>. The &ldquo;how many at once&rdquo; ceiling is worked out
              from that and their production time — you never type it.
            </p>
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-xs text-gray-700 tabular-nums">
              orders per week × ( production days ÷ 7 )
              <br />
              <span className="text-gray-500">20 × ( 14 ÷ 7 ) = </span>
              <span className="font-semibold text-gray-900">40 at once</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              If 20 orders arrive every week and each takes two weeks on the floor, then at
              any moment about 40 are in progress. A factory with a longer production time
              holds more work at once from the same weekly rate.
            </p>
          </Section>

          <Section title="The colours">
            <ul className="space-y-1.5">
              {[
                ["bg-green-100 text-green-900 border-green-300", "under 70%", "Comfortable. Room to place more."],
                ["bg-amber-100 text-amber-900 border-amber-300", "70–100%", "At capacity. Working, but no slack."],
                ["bg-red-100 text-red-900 border-red-300", "over 100%", "Beyond what they said they can take."],
                ["bg-gray-100 text-gray-600 border-gray-300", "not set", "Nobody has entered this factory's capacity."],
              ].map(([cls, chip, desc]) => (
                <li key={chip} className="flex items-baseline gap-3 text-xs">
                  <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold shrink-0 w-[76px] text-center ${cls}`}>
                    {chip}
                  </span>
                  <span className="text-gray-600">{desc}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-600 leading-relaxed">
              <strong className="text-gray-900">Grey is not a health rating.</strong> It
              means the question can&apos;t be answered yet, not that the factory is fine.
              A manufacturer stays grey until someone enters its orders-per-week, and
              pipeline additionally needs its production time on file.
            </p>
          </Section>

          <Section title="Where the assignment date comes from">
            <p className="text-xs text-gray-600 leading-relaxed">
              Intake depends on knowing the day a printer was put on a job. When you build
              a PO, the <strong className="text-gray-900">PO Date</strong> on that document
              becomes it — so back-dating a PO back-dates the intake. When orders arrive by
              import, it comes from the sheet&apos;s{" "}
              <strong className="text-gray-900">Printer Assigned Date</strong> column.
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">
              If either is wrong, open the order and edit{" "}
              <strong className="text-gray-900">Printer Assigned Date</strong> directly.
              Orders assigned before this was tracked show{" "}
              <em>not recorded</em> — worth filling in if the order is recent enough to
              matter.
            </p>
          </Section>

          <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-200 pt-4">
            Both numbers only ever count orders that haven&apos;t shipped. Once an order
            moves to Shipped it leaves the factory&apos;s floor and releases its place
            immediately.
          </p>
        </div>
      </div>
    </div>
  );
}
