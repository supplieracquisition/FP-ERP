"use client";

import { P, B, Section, Steps, Callout, Card, Footnote } from "../HowItWorksModal";

/**
 * PO Builder explained.
 *
 * This is the page where something irreversible happens, so the panel is built
 * around the moment it happens: export is what assigns. Everything before that
 * is a draft, everything after is committed. The claim is explained from the
 * user's side — why orders disappear from the search, why a colleague's order
 * refuses you — rather than as a locking mechanism.
 */

export const poBuilderHelp = {
  title: "How PO Builder works",
  subtitle: "Assemble a purchase order from pooled orders. Exporting it is what assigns them.",
  Body: POBuilderHelp,
};

function POBuilderHelp() {
  return (
    <>
      <Section title="What this page is for">
        <P>
          It produces the purchase order you send a factory, and it is the <B>only</B> place an
          order gets assigned to a printer. Nothing else in the tool hands work to a manufacturer.
        </P>
        <P>
          Until you export, everything on this page is a draft you can change or abandon freely.
          Exporting writes the assignment to every order on the PO at once.
        </P>
      </Section>

      <Section title="The run, start to finish">
        <Steps
          items={[
            <>
              Search for orders. Only <B>unassigned</B> ones appear, and only ones nobody else is
              holding — you cannot build a PO around an order that will refuse you at the end.
            </>,
            <>
              Add the lines. The first one you add fills in the PO number, client, delivery address
              and due date for you; change any of it.
            </>,
            <>Pick the fabric swatch and colour per line, then enter the size breakdown.</>,
            <>Set the PO date, ship date, delivery date and shipping method.</>,
            <>
              Export as PDF or CSV. This <B>saves and assigns</B>, then downloads the document.
            </>,
          ]}
        />
      </Section>

      <Section title="What a PO has to be consistent about">
        <P>Adding a line is refused, with the reason, if it would break one of these:</P>
        <div className="grid sm:grid-cols-2 gap-3">
          <Card name="One nominated supplier">
            <P>Every line on a PO must be going to the same factory. That factory is who the PO is for.</P>
          </Card>
          <Card name="One client and address">
            <P>
              All lines must share a client name and delivery address — otherwise it is two
              shipments, and it needs to be two POs.
            </P>
          </Card>
        </div>
        <P>
          These are checked <B>before</B> the order is held, so picking a mismatched line costs you
          nothing.
        </P>
      </Section>

      <Section title="Holding orders while you build">
        <P>
          The moment you add a line, that order is held in your name. Everyone else sees it greyed
          out and cannot take it. That is what stops two people building the same PO at once and
          only discovering it on save.
        </P>
        <P>
          Taking a line off gives it straight back, and <B>Reset</B> gives back everything on the
          draft. If you simply close the tab, the hold expires by itself after <B>24 hours</B>
          {" — "}nothing is ever stranded, but a half-built PO left open does keep those orders out
          of everyone&apos;s reach until then.
        </P>
        <Callout title="&ldquo;Claim lost — nothing was assigned&rdquo;">
          <P>
            This means an order on your PO stopped being yours while you were building — usually a
            tab left open past the 24 hours, or an admin releasing it. <B>Nothing was written</B>:
            the export is all-or-nothing, so no part of the PO went through. Refresh the pool and
            rebuild it.
          </P>
        </Callout>
      </Section>

      <Section title="What exporting writes">
        <P>Alongside the document you download, exporting records against every line on the PO:</P>
        <P>
          the <B>printer</B> it is assigned to · its opening <B>stage</B>, which is sample
          production when a test print is needed and fabric sourcing when it isn&apos;t · the{" "}
          <B>ship, delivery and test print dates</B> you entered · and <B>you</B>, permanently, as
          the person who processed it.
        </P>
        <Callout tone="warn" title="The PO date is a real date, not a timestamp">
          <P>
            Whatever you put in <B>PO Date</B> becomes the day that printer was put on the job. Back-date
            a PO and you back-date the assignment. It is the date the capacity board counts the work
            from, so an idly wrong PO date quietly misstates how loaded that factory looks.
          </P>
        </Callout>
      </Section>

      <Footnote>
        Exported orders leave the pool. From then on they live on the orders board under their
        production stage, and changing the manufacturer is no longer something this page can do.
      </Footnote>
    </>
  );
}
