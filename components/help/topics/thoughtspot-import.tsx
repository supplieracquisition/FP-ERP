"use client";

import { P, B, Section, Steps, Callout, Defs, Footnote } from "../HowItWorksModal";

/**
 * The manual ThoughtSpot route, explained.
 *
 * Deliberately a second panel on the Import tab rather than more sections
 * bolted onto `import`. That one answers "what does this page do to my data",
 * which every import raises; this one answers "an order is missing, how do I
 * go and get it", which is a specific errand most visits never involve.
 *
 * It therefore does NOT restate the update rules — matching on order item ID,
 * absent columns being left alone, the ignored-column warning. Those belong to
 * the other panel, they are one click away on the same page, and two panels
 * carrying the same explanation is two places for it to drift.
 */

export const thoughtspotImportHelp = {
  title: "Importing from ThoughtSpot",
  subtitle: "For orders that never reached the ERP on their own.",
  Body: ThoughtspotImportHelp,
};

function ThoughtspotImportHelp() {
  return (
    <>
      <Section title="Why some orders never arrive">
        <P>
          The ERP fills itself from a scheduled pull, and that pull only sees orders the sheet hands
          it. Because of the way orders are currently categorised on V4, some never land in that
          category at all — so they are real, live orders with a Freshdesk ticket against them, and
          the tool has never heard of them.
        </P>
        <P>
          Nothing is broken when this happens, and nothing will fix it on its own. The order will
          not turn up later. Somebody has to go and get it, and the saved ThoughtSpot answer is
          where it lives in the meantime.
        </P>
        <P>
          Use this whenever an order sitting in your pool on Freshdesk has <B>no matching row</B> in
          the ERP.
        </P>
      </Section>

      <Section title="Getting the order in">
        <Steps
          items={[
            <>
              Press <B>Use the ThoughtSpot answer</B> on this page. It opens the saved answer
              everyone works from — there is no need to build your own.
            </>,
            <>
              In the left panel, under the search section, search for <B>Order Item ID</B>. Hover
              over the Order Item ID button that comes up and choose <B>Filter</B>.
            </>,
            <>
              In the <B>Include</B> section, add every order item ID you need. A whole batch at once
              is fine — there is no reason to do these one at a time.
            </>,
            <>
              Download the filtered data as <B>CSV</B>.
            </>,
            <>
              Come back here, drop the file on the box above and press <B>Import Orders</B>.
            </>,
            <>
              Read the summary: the <B>error count</B> first, then the <B>ignored columns</B>.
            </>,
          ]}
        />
        <Callout title="Download CSV, not XLSX">
          <P>
            The box above reads <B>.csv</B> only and will refuse anything else. If you already have
            an XLSX, open it and re-save it as CSV before coming back.
          </P>
        </Callout>
      </Section>

      <Section title="Where the order ends up">
        <P>
          Once imported, the order is assigned to whichever manufacturer it was given on V4, sitting
          in <B>Sample Production</B>, and visible in that manufacturer&rsquo;s own dashboard as
          well.
        </P>
        <Callout tone="warn" title="You may not be able to see it yourself">
          <P>
            You see orders for the manufacturers you are POC for, plus everything unassigned. An
            imported order goes straight to its manufacturer, so if that is not one of yours it will
            not appear in your list. It is in the tool, and the POC for that manufacturer can see
            it. Ask an admin if you need it moved.
          </P>
        </Callout>
      </Section>

      <Section title="When it doesn't go through">
        <Defs
          items={[
            [
              "No supplier matches",
              "The manufacturer on the order does not exist in the ERP yet, and nothing on that row was changed. Add the supplier, then import the same file again.",
            ],
            [
              "Missing ID",
              "That row had no order ID or order item ID to file it under and was skipped — usually a blank row at the bottom of the export. The summary gives you the row number.",
            ],
            [
              "Nothing uploads",
              "The file is almost certainly still an XLSX. Re-save it as CSV.",
            ],
            [
              "A column is empty",
              "Check the ignored-columns warning on the summary. A heading that has been reworded in the answer matches nothing here and is dropped without an error.",
            ],
          ]}
        />
      </Section>

      <Footnote>
        Everything else about importing — what a row does to an order already here, and why a column
        you don&rsquo;t send is left alone — is in <B>How does this work?</B> at the top of this
        page. Repeats are safe either way: importing the same file twice does not create duplicates.
      </Footnote>
    </>
  );
}
