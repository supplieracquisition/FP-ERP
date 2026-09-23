"use client";

import { P, B, Section, Card, Callout, Defs } from "../HowItWorksModal";

/**
 * The orders board explained.
 *
 * Strictly about this board. Three things here are learned the hard way and so
 * get the most space: a row is an order ITEM and not an order, nomination is
 * not assignment, and what you can see depends on which suppliers you are POC
 * of. The claim lock gets a section because a greyed card with no explanation
 * reads as a bug.
 */

export const ordersHelp = {
  title: "How the orders board works",
  subtitle: "Every line in flight, in one of two views, scoped to what is yours to work.",
  Body: OrdersHelp,
};

function OrdersHelp() {
  return (
    <>
      <Section title="What this board is for">
        <P>
          It is the working list of everything in flight: what has been sold, who is making it, how
          far along it is, and what is still waiting for someone to pick it up. Most days you are
          here to answer one of two questions — <B>what needs my attention</B>, or{" "}
          <B>where has this particular order got to</B>.
        </P>
        <P>
          A row is <B>one order item</B>, not one order. A single order for three different garments
          is three rows, because each one can go to a different printer, move at a different speed
          and ship on a different day. Rows from the same order share an order number, which is how
          you spot them.
        </P>
      </Section>

      <Section title="Two views of the same orders">
        <div className="grid sm:grid-cols-2 gap-3">
          <Card name="Table" question="Which orders match what I'm looking for?">
            <P>
              Search, and filter by supplier, style code, colour, print type and decoration. Use it
              when you know roughly what you want and need to find it.
            </P>
          </Card>
          <Card name="Kanban" question="What stage is everything at?">
            <P>
              The same orders as cards under their stage, draggable from one to the next. Use it to
              see shape and movement rather than detail.
            </P>
          </Card>
        </div>
        <P>
          The toggle at the top right switches between them, and filters apply to whichever you are
          in. The Kanban re-reads the server every 20 seconds while the tab is in front, so
          someone else&apos;s move appears without a reload.
        </P>
      </Section>

      <Section title="The columns">
        <Defs
          items={[
            ["Unassigned", "No printer on it yet — the shared pool."],
            ["Sample production", "A test print is being made and approved."],
            ["Fabric sourcing", "Materials being sourced and cut."],
            ["Printing", "On the press."],
            ["Assembly", "Being made up."],
            ["QA + packing", "Checked and boxed."],
            ["Shipped", "Left the factory."],
            ["Delivered", "Landed. Hidden by default — there is a toggle to show it."],
          ]}
        />
        <P>
          A card sits in <B>Unassigned</B> purely because no printer is assigned to it, whatever
          else has been filled in on it. The middle columns are the order&apos;s production stage;
          the last two come from its status.
        </P>
      </Section>

      <Section title="What you can see">
        <P>
          An admin sees every order. Anyone else on the team sees three things added together:
          orders with <B>a supplier you are POC of</B>, orders <B>nominated</B> to one of your
          suppliers, and <B>the whole unassigned pool</B>, which the entire team shares.
        </P>
        <P>
          Being POC of nothing narrows you to the pool alone — it never widens you to everything. If
          the board looks emptier than expected, the likely answer is that no suppliers are assigned
          to you yet, not that orders are missing.
        </P>
        <P>A supplier logging in to the portal sees only their own orders, and never the pool.</P>
      </Section>

      <Section title="Nomination is not assignment">
        <P>
          A <B>nominated supplier</B> on a card is a suggestion about who should make it. It does
          not take the order out of the pool and does not stop anyone else picking it up. The order
          stays Unassigned until a PO is actually built for it.
        </P>
        <P>
          So an order you nominated last week can still be sitting in Unassigned. Nothing has gone
          wrong — nobody has built its PO yet.
        </P>
      </Section>

      <Section title="Greyed-out cards">
        <P>
          A card that is greyed and refuses to be dragged is <B>claimed</B>: someone else is
          assembling its PO right now, and the card names who. Claims stop two people from building
          the same PO in parallel and finding out at the end.
        </P>
        <P>
          A claim lasts <B>24 hours</B> and then lets go on its own, so a closed tab never strands
          an order. Your own claims are not locks — those cards stay yours to work. An admin can
          release someone else&apos;s from the card.
        </P>
      </Section>

      <Section title="What you can change here">
        <P>
          Dragging a card moves it between <B>stages</B>. Opening an order lets you edit its
          details, dates and tracking. Every change is recorded against your name.
        </P>
        <Callout title="You cannot set the printer from this board">
          <P>
            There is no control for it, by drag or by edit, and the server refuses it if asked.
            Assigning a printer happens in one place only — exporting the PO in PO Builder — so that
            the assignment and the paperwork can never disagree.
          </P>
        </Callout>
      </Section>

      <Section title="Bulk delete">
        <Callout tone="crit" title="Admins only, and it does not come back">
          <P>
            Selecting rows in the table view and deleting removes those order items outright. It
            acts on exactly what you have selected on screen — changing a filter mid-selection
            cannot make it reach rows you can no longer see — but there is no undo. Re-importing
            the sheet is the only way back.
          </P>
        </Callout>
      </Section>
    </>
  );
}
