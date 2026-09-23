"use client";

import { P, B, Section, Defs, Callout, Footnote } from "../HowItWorksModal";

/**
 * The product library explained.
 *
 * It is a lookup, not a workspace, so the panel is short. The two things worth
 * saying are that the pricing comes from the sheet and is not editable here,
 * and that "not set" in the capacity column means unknown rather than full —
 * the same trap the capacity board's grey has, in a column that looks numeric.
 */

export const productLibraryHelp = {
  title: "How the product library works",
  subtitle: "Which factories make a style, at what price, and whether they have room for it.",
  Body: ProductLibraryHelp,
};

function ProductLibraryHelp() {
  return (
    <>
      <Section title="What this page is for">
        <P>
          It answers <B>who can make this, and should I send it to them?</B> Pick one or more style
          codes and you get every supplier that makes each style, side by side, with their pricing
          and how much room they have right now.
        </P>
        <P>
          It is a lookup you use <em>before</em> committing — while deciding who to nominate. Nothing
          you do here changes an order.
        </P>
      </Section>

      <Section title="Finding a style">
        <P>
          Search the picker by <B>style code</B> or product name and select as many as you need.
          Each one gets its own table, so you can compare a whole order&apos;s styles in one view.
          Clear a selection to drop it.
        </P>
      </Section>

      <Section title="What each column tells you">
        <Defs
          items={[
            ["Supplier", "The factory. Their sales rep and email sit alongside for getting in touch."],
            ["DDP sea price", "Landed price per unit shipped by sea — cheaper, slower."],
            ["DDP air price", "Landed price per unit shipped by air — dearer, faster."],
            ["Weekly capacity", "How much room they have on the floor right now. See below."],
          ]}
        />
      </Section>

      <Section title="The capacity column">
        <P>
          It reads <B>&ldquo;12 free (28/40 in progress)&rdquo;</B>: 28 orders on their floor
          against a ceiling of 40, so 12 more would fit. It is the same measure of a factory&apos;s
          floor that the capacity board shows, asked here about the factories that make this
          particular style.
        </P>
        <Callout title="&ldquo;Not set&rdquo; does not mean full — or empty">
          <P>
            It means the question can&apos;t be answered for that supplier: either nobody has
            entered their capacity figures, or the name on the product sheet hasn&apos;t been
            matched to a supplier record in the ERP. Hover it for which. Treat it as{" "}
            <B>unknown</B> and ask, rather than reading it as zero.
          </P>
        </Callout>
      </Section>

      <Footnote>
        Everything on this page comes from the product sheet and is read-only here — prices,
        timelines and which factories make what are changed in the sheet and picked up on the next
        sync. The capacity figures are the exception: those live on the supplier&apos;s record in
        the ERP.
      </Footnote>
    </>
  );
}
