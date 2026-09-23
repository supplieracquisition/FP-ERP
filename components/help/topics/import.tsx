"use client";

import { P, B, Section, Steps, Callout, Defs } from "../HowItWorksModal";

/**
 * The CSV import explained.
 *
 * The two questions people actually have are "will this overwrite what's
 * already there" and "did it take everything in my file". The update rule and
 * the ignored-columns list answer those, and they get the most space. The
 * clear-first checkbox gets a red callout because it is the one genuinely
 * destructive control on the page.
 */

export const importHelp = {
  title: "How importing works",
  subtitle: "Upload the sheet; matching rows are updated, new ones are created, nothing else moves.",
  Body: ImportHelp,
};

function ImportHelp() {
  return (
    <>
      <Section title="What this page is for">
        <P>
          It brings the orders sheet into the ERP: new orders appear, and orders already here are
          brought up to date with what the sheet now says. Drop a <B>.csv</B> export on the box, or
          click to pick one.
        </P>
        <P>
          You can run it as often as you like. Importing the same file twice does not create
          duplicates — see below.
        </P>
      </Section>

      <Section title="What happens to a row">
        <P>
          Every row is matched on its <B>order item ID</B>. That is the identity of the line, and it
          decides everything:
        </P>
        <Defs
          items={[
            ["Already here", "Updated in place with the values in the file."],
            ["Not here yet", "Created as a new order item."],
            ["Bad or missing ID", "Skipped and reported as an error, with its row number."],
          ]}
        />
        <P>
          Printer names are matched to suppliers leniently, so the variations the sheet uses for the
          same factory still land on the right one.
        </P>
      </Section>

      <Section title="A column you don't send is left alone">
        <P>
          This is the rule worth knowing. The import only writes the fields your file{" "}
          <B>actually has columns for</B>. A partial export — say a file with just IDs and ship
          dates — updates those dates and touches nothing else.
        </P>
        <P>
          So a missing column never blanks live data. A file without a &ldquo;requires test
          print&rdquo; column does not reset that flag on every row it touches, and work done in the
          ERP since the last export survives a re-import.
        </P>
      </Section>

      <Section title="Read the results, especially the ignored columns">
        <P>
          When the import finishes you get three things: how many rows went in, how many failed with
          the reason for each, and — the one people miss — <B>which columns in your file matched
          nothing</B> and were therefore not imported.
        </P>
        <Callout title="An ignored column is a silent data loss">
          <P>
            An unrecognised heading is dropped and the import still reports success. That is how the
            units and value columns once went missing unnoticed. If a column you care about is in
            that list, the import did not fail — it just did not bring that column, and the fix is
            the heading, not the file.
          </P>
        </Callout>
      </Section>

      <Section title="Starting from scratch">
        <Callout tone="crit" title="Clear first and Clear all delete every order">
          <P>
            Both controls are admin-only and both wipe the entire orders table — not just the ones
            in your file, and not just yours. Everything recorded in the ERP against those orders
            goes with them. Use them only when you genuinely intend to rebuild from the sheet, and
            remember that a normal import already updates what is there.
          </P>
        </Callout>
      </Section>

      <Section title="The usual run">
        <Steps
          items={[
            <>Export the sheet as CSV.</>,
            <>Drop it here and press Import.</>,
            <>
              Read the summary: the <B>error count</B> first, then the <B>ignored columns</B>.
            </>,
            <>Fix anything the summary flagged in the sheet and import again — repeats are safe.</>,
          ]}
        />
      </Section>

      <Section title="The automatic import">
        <P>
          Orders also arrive on their own from the scheduled pull, without anyone visiting this
          page. It runs the identical rules — same matching, same update behaviour, same reporting —
          so a manual upload and an automatic one can never disagree about what a row means.
        </P>
        <P>
          Each import is recorded as <B>one entry</B> in the activity log naming the file and the
          counts, never one entry per row, so a single upload of the standing sheet cannot bury a
          day of real work.
        </P>
      </Section>
    </>
  );
}
