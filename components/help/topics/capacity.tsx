"use client";

import { P, B, Section, Card, Literal, Footnote } from "../HowItWorksModal";

/**
 * The capacity board explained, for whoever is deciding where the next PO goes.
 *
 * Written for POCs rather than for engineers: it names Intake and Pipeline by
 * what they answer, not by how they are computed, and the 2x2 is the part that
 * actually changes a decision. The one idea worth carrying away is that the two
 * numbers can disagree, and that "intake high / pipeline fine" is the case where
 * the reassuring number is the misleading one.
 */

/** The 2x2's squares. Local to this panel — nothing else reads two numbers against each other. */
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

export const capacityHelp = {
  title: "How the capacity board works",
  subtitle:
    "Two numbers per manufacturer. They measure different things, and the disagreement is the useful part.",
  Body: CapacityHelp,
};

function CapacityHelp() {
  return (
    <>
      <Section title="What this board is for">
        <P>
          It answers one question: <B>where should the next PO go?</B> Every manufacturer can only
          carry so much at a time, and the board shows how heavily each one is loaded, how fast work
          is arriving, and whether there is room for what you are about to send. It is a placement
          tool used before you commit, not a report on what already happened.
        </P>
        <P>
          It reflects committed work only. An order appears the moment a printer is assigned to it
          and drops off the moment it ships. Orders still in the unassigned pool load nobody, and a
          nomination doesn&apos;t count either — only building the PO commits the work.
        </P>
      </Section>

      <Section title="The two numbers">
        <div className="grid sm:grid-cols-2 gap-3">
          <Card
            name="Intake"
            question="How much new work did I hand this factory this week?"
            example="18/20 — you gave them 18, they can take 20."
          >
            <P>
              Orders where you assigned this printer in the last 7 days, against the orders per week
              they can absorb.
            </P>
          </Card>
          <Card
            name="Pipeline"
            question="How much work is on their floor right now?"
            example="35/40 — 35 jobs on the floor, room for 40."
          >
            <P>
              Orders in production today — started, not yet shipped — against how many they can have
              going at once.
            </P>
          </Card>
        </div>
        <P>
          The difference is timing. An order you assign today that ships in six weeks is intake{" "}
          <em>now</em>, then sits in pipeline for the next six weeks. That gap is why there are two
          numbers: one figure can&apos;t tell a factory you&apos;ve just loaded up from one
          that&apos;s already jammed, and those call for opposite decisions.
        </P>
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
          <Cell
            tone="ok"
            verdict="Healthy"
            body="Steady work going in, floor comfortable."
            action="Place work here as normal."
          />
          <Cell
            tone="warn"
            verdict="Working it off"
            body="Floor is full, but you've already eased off. A backlog clearing itself."
            action="Hold. It recovers as jobs ship — adding more undoes that."
          />

          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 self-center">
            Intake high
          </p>
          <Cell
            tone="warn"
            verdict="Full soon"
            body="You've just handed them a lot and it hasn't reached the floor yet. Pipeline will climb in the coming days."
            action="Don't read the green as room. Slow down before it turns."
          />
          <Cell
            tone="crit"
            verdict="Overloaded"
            body="Full now, and still being fed. Ship dates here are at risk."
            action="Stop assigning. Move the next POs elsewhere."
          />
        </div>
        <P>
          <B>Full soon</B> is the square worth learning. Pipeline still looks green, so nothing
          appears wrong — but the work is already committed and simply hasn&apos;t started.
          It&apos;s the one case where the reassuring number is the misleading one.
        </P>
      </Section>

      <Section title="Where the pipeline ceiling comes from">
        <P>
          You enter one figure per manufacturer: <B>orders per week</B>. The &ldquo;how many at
          once&rdquo; ceiling is worked out from that and their production time — you never type it.
        </P>
        <Literal>
          orders per week × ( production days ÷ 7 )
          <br />
          <span className="text-gray-500">20 × ( 14 ÷ 7 ) = </span>
          <span className="font-semibold text-gray-900">40 at once</span>
        </Literal>
        <P>
          If 20 orders arrive every week and each takes two weeks on the floor, then at any moment
          about 40 are in progress. A factory with a longer production time holds more work at once
          from the same weekly rate.
        </P>
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
              <span
                className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold shrink-0 w-[76px] text-center ${cls}`}
              >
                {chip}
              </span>
              <span className="text-gray-600">{desc}</span>
            </li>
          ))}
        </ul>
        <P>
          <B>Grey is not a health rating.</B> It means the question can&apos;t be answered yet, not
          that the factory is fine. A manufacturer stays grey until someone enters its
          orders-per-week, and pipeline additionally needs its production time on file.
        </P>
      </Section>

      <Section title="Where the assignment date comes from">
        <P>
          Intake depends on knowing the day a printer was put on a job. When you build a PO, the{" "}
          <B>PO Date</B> on that document becomes it — so back-dating a PO back-dates the intake.
          When orders arrive by import, it comes from the sheet&apos;s{" "}
          <B>Printer Assigned Date</B> column.
        </P>
        <P>
          If either is wrong, open the order and edit <B>Printer Assigned Date</B> directly. Orders
          assigned before this was tracked show <em>not recorded</em> — worth filling in if the
          order is recent enough to matter.
        </P>
      </Section>

      <Footnote>
        Both numbers only ever count orders that haven&apos;t shipped. Once an order moves to
        Shipped it leaves the factory&apos;s floor and releases its place immediately.
      </Footnote>
    </>
  );
}
