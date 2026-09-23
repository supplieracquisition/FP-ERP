"use client";

import { P, B, Section, Callout, Defs, Footnote } from "../HowItWorksModal";

/**
 * The API keys page explained.
 *
 * Written for an admin who may not think of themselves as technical, because
 * this page hands out a credential. The three things it has to land: the key is
 * shown once and cannot be recovered, it is not a person's login, and Last Used
 * is how you tell whether the automation is actually working.
 */

export const apiKeysHelp = {
  title: "How API keys work",
  subtitle: "Credentials for automations, not for people. Shown once, revocable any time.",
  Body: ApiKeysHelp,
};

function ApiKeysHelp() {
  return (
    <>
      <Section title="What this page is for">
        <P>
          Some things talk to the ERP without a person signing in — chiefly the automation that
          pulls orders in from the sheet on a schedule. An API key is how one of those proves it is
          allowed to. No key, no entry.
        </P>
        <P>
          A key is not an account. It belongs to a <B>system</B>, and it has no password, no inbox
          and no screen. People get accounts on the Team page instead.
        </P>
      </Section>

      <Section title="Creating one">
        <P>
          Name it after the thing that will use it — <B>n8n-hourly-import</B> beats{" "}
          <B>key 2</B> — because the name is all you will have to go on when deciding later whether
          a key is still needed.
        </P>
        <Callout tone="crit" title="You see the key once, and never again">
          <P>
            Copy it straight into whatever is going to use it. Only a scrambled form is stored here,
            so nobody — including an admin, including support — can look it up afterwards. Lose it
            and the only path is to delete that key and create another.
          </P>
        </Callout>
      </Section>

      <Section title="Reading the table">
        <Defs
          items={[
            ["Name", "What you called it. The only clue to what it is for, so name it well."],
            ["Created", "When it was made."],
            ["Last used", "The last time something authenticated with it."],
          ]}
        />
        <P>
          <B>Last used</B> is the useful column. After wiring a key into an automation it should
          stop saying <em>Never</em> on the automation&apos;s next run — that is the confirmation it
          is genuinely working. A key that says <em>Never</em> weeks later is either unused or
          pointed at nothing, and a key that stops updating means the automation has quietly
          stopped.
        </P>
      </Section>

      <Section title="Deleting">
        <P>
          Deleting takes effect at once: anything still using that key starts being refused on its
          next request. That is what you want for a key that has leaked, and what to watch out for
          otherwise — clear out the wrong one and the order import goes quiet with nothing visibly
          broken on screen.
        </P>
        <P>Rotating is two steps: create the replacement, put it in place, then delete the old one.</P>
      </Section>

      <Footnote>
        Creating and deleting keys is recorded in the activity log. The key itself never is — an
        audit trail outlives any rotation, so a credential must never be written into one.
      </Footnote>
    </>
  );
}
