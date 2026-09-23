"use client";

import { P, B, Section, Card, Callout, Defs, Literal, Footnote } from "../HowItWorksModal";

/**
 * The suppliers page explained.
 *
 * Two things earn their space. First, "POC" means two different things on this
 * page — the contact at the factory and the person here who handles it — and
 * they sit a few inches apart, so the panel separates them explicitly. Second,
 * the numbers on a supplier card are not filing: they are what the capacity
 * board reads, and a blank is not a zero.
 */

export const suppliersHelp = {
  title: "How the suppliers page works",
  subtitle: "One record per manufacturer: how to reach them, how fast they are, and who here owns them.",
  Body: SuppliersHelp,
};

function SuppliersHelp() {
  return (
    <>
      <Section title="What this page is for">
        <P>
          It is the master list of manufacturers. A supplier record is what an order gets assigned
          to, what the capacity board measures, and what a factory&apos;s portal login is attached
          to — so what you enter here shows up across the rest of the tool.
        </P>
        <P>Adding, editing and deactivating suppliers is admin-only.</P>
      </Section>

      <Section title="&ldquo;POC&rdquo; means two different things here">
        <P>Both are on the same card, so it is worth being precise:</P>
        <div className="grid sm:grid-cols-2 gap-3">
          <Card name="POC name / email / phone" question="Who do I call at the factory?">
            <P>
              Their person — the contact details for the manufacturer. Free text, used for getting
              hold of them.
            </P>
          </Card>
          <Card name="POC Assigned" question="Who here owns this supplier?">
            <P>
              Someone on our team. This is the one that changes behaviour: it decides who sees this
              supplier&apos;s orders on the orders board.
            </P>
          </Card>
        </div>
        <Callout title="Leaving POC Assigned empty hides those orders">
          <P>
            An internal user sees the orders of the suppliers they are assigned to, plus the shared
            unassigned pool. A supplier with nobody assigned has orders only an admin can see.
            Assigning is how a new team member starts seeing real work.
          </P>
        </Callout>
      </Section>

      <Section title="The numbers, and what reads them">
        <Defs
          items={[
            ["Capacity", "Orders per week this factory can absorb. The one figure the whole capacity board is built on."],
            ["Production time", "Days on their floor. With capacity, it sets how much they can have going at once."],
            ["Test print TAT", "Days to turn a test print around."],
            ["Shipping — air / sea", "Days in transit by each route."],
          ]}
        />
        <P>
          Capacity and production time together produce the &ldquo;how many at once&rdquo; ceiling —
          you never type that figure:
        </P>
        <Literal>
          <span className="text-gray-500">20 orders/week × ( 14 production days ÷ 7 ) = </span>
          <span className="font-semibold text-gray-900">40 at once</span>
        </Literal>
        <Callout title="A blank is not a zero">
          <P>
            An empty box means <B>not known yet</B>, and the capacity board shows that supplier as
            grey rather than as full or as free. Typing 0 is a real answer — &ldquo;they can take
            nothing&rdquo; — so leave it blank until you know.
          </P>
        </Callout>
        <P>
          These fields save one at a time, as you leave each box. There is no Save button on an
          existing supplier.
        </P>
      </Section>

      <Section title="Portal logins">
        <P>
          A supplier record and a supplier login are separate things. Records are meant to be
          created without one — you can add a factory long before anyone there needs access — and{" "}
          <B>Send invite</B> attaches a login afterwards.
        </P>
        <P>
          The invite emails them a link and they choose their own password; you never set or see it.
          A factory can have <B>more than one</B> login — sampling and production, say — so inviting
          a second address adds to the record rather than replacing anyone.
        </P>
      </Section>

      <Section title="Deactivating">
        <P>
          Deactivating takes a supplier out of the dropdowns you pick from without touching
          anything already assigned to them. Their history stays intact and the record can be
          switched back on.
        </P>
        <P>
          It is the right move for a factory you have stopped using. There is no delete, and that is
          deliberate — orders point at these records.
        </P>
      </Section>

      <Footnote>
        The nickname is what shows on order cards where the full legal name is too long to read.
      </Footnote>
    </>
  );
}
