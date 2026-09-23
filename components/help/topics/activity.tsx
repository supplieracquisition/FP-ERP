"use client";

import { P, B, Section, Defs, Callout, Steps, Footnote } from "../HowItWorksModal";

/**
 * The activity log explained.
 *
 * Nobody browses an audit log; they arrive at it holding a question — who
 * changed this, when did it break, who deleted that. So the panel is organised
 * around narrowing down rather than around the columns, and the worked example
 * is the part most likely to be used.
 */

export const activityHelp = {
  title: "How the activity log works",
  subtitle: "Every change made through the tool, by the team and by suppliers, with a name on it.",
  Body: ActivityHelp,
};

function ActivityHelp() {
  return (
    <>
      <Section title="What this page is for">
        <P>
          It answers <B>who changed this, and when?</B> Every action taken through the ERP is
          written down as it happens — the person, what they did, what they did it to, and the
          moment. Nothing here can be edited or removed, by anyone.
        </P>
        <P>Admin only, because it shows everyone&apos;s activity and not just your own.</P>
      </Section>

      <Section title="Narrowing it down">
        <Defs
          items={[
            ["Search", "Free text across the entries — an order number, a supplier, a person's name."],
            ["Action", "One kind of change, grouped into orders, suppliers, people and system."],
            ["From / to", "A date range, for when you know roughly when something happened."],
          ]}
        />
        <P>
          They combine, and the count beside them tells you how many are on. <B>Clear filters</B>{" "}
          puts you back to everything, newest first.
        </P>
      </Section>

      <Section title="Reading a row">
        <P>
          Each row is one action: who did it, a plain-language summary of what happened, and what it
          happened to. The badge next to a name is that person&apos;s role at the time — admin,
          internal, supplier, or <B>system</B> for work nothing human triggered, such as the
          scheduled order import.
        </P>
        <Callout title="The red-edged rows are the destructive ones">
          <P>
            Deletions — an order, a bulk delete, clearing all orders, removing a supplier or a team
            member, revoking a key — carry a red left edge so they can be found by eye. When
            something has gone missing, those are the rows to scan first.
          </P>
        </Callout>
      </Section>

      <Section title="Worked example: an order lost its supplier">
        <Steps
          items={[
            <>Put the order number in the search box.</>,
            <>Leave the dates open at first — you are looking for the shape of the history.</>,
            <>
              Read up from the bottom: it will have been claimed, assigned when the PO was built,
              then moved through stages by whoever was working it.
            </>,
            <>The row that breaks the pattern is the one you came for, and it has a name on it.</>,
          ]}
        />
      </Section>

      <Section title="What the log deliberately does not do">
        <P>
          An import writes <B>one entry</B> naming the file and its counts, not one per row. A
          single upload of the standing sheet touches hundreds of orders; logged per order, one
          upload would bury a whole day of real work. The per-row detail, including every error,
          stays with the import itself.
        </P>
        <P>
          Secrets are never written here either. An API key&apos;s creation is logged; the key is
          not.
        </P>
      </Section>

      <Footnote>
        Entries are kept permanently and are always shown newest first. Someone leaving the company
        does not remove their history.
      </Footnote>
    </>
  );
}
