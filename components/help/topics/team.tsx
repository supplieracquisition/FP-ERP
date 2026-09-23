"use client";

import { P, B, Section, Defs, Callout, Footnote } from "../HowItWorksModal";

/**
 * The team page explained.
 *
 * Short, because the page is. The two questions it has to answer are what the
 * two roles actually differ on, and why a brand-new user reports an empty
 * orders board — which is not a bug and not a role problem.
 */

export const teamHelp = {
  title: "How the team page works",
  subtitle: "Who has access to the ERP, and at what level.",
  Body: TeamHelp,
};

function TeamHelp() {
  return (
    <>
      <Section title="What this page is for">
        <P>
          It is the roster of everyone inside Fresh Prints with access to the tool. Anyone internal
          can read it — knowing who your colleagues are is just coordination — while adding people,
          changing roles and removing accounts are admin-only.
        </P>
        <P>
          Supplier logins are not here. Those belong to a factory and are created from that
          supplier&apos;s record.
        </P>
      </Section>

      <Section title="The two roles">
        <Defs
          items={[
            [
              "Internal",
              "Works orders. Sees the orders of the suppliers assigned to them plus the shared unassigned pool, and builds POs.",
            ],
            [
              "Admin",
              "All of that, without scoping — every order — plus suppliers, this page, API keys, the activity log, bulk delete and releasing someone else's claim.",
            ],
          ]}
        />
        <P>
          A role change takes effect immediately. It is not a display setting: the server decides
          what every request is allowed to do from this value.
        </P>
      </Section>

      <Section title="Adding someone">
        <P>
          Enter their name, email and role. They are sent an invite and <B>choose their own
          password</B> from it — you never set one, and there is no step where a password is typed
          for somebody else.
        </P>
        <P>
          Until they accept, the account exists on this list but cannot sign in. If an invite goes
          astray, the email address is the thing to check first.
        </P>
      </Section>

      <Section title="A new user's orders board looks empty">
        <Callout title="That is the scoping working, not a broken account">
          <P>
            An internal user with no suppliers assigned to them sees the unassigned pool and
            nothing else. They are not missing permissions — nobody has told the tool which
            suppliers are theirs. Assign them as POC on those suppliers&apos; records and their
            orders appear.
          </P>
        </Callout>
      </Section>

      <Section title="What you cannot do to yourself">
        <P>
          You cannot change your own role or delete your own account, even as an admin. The
          controls are hidden and the server refuses it regardless — this is what stops the last
          admin from locking everyone out.
        </P>
      </Section>

      <Footnote>
        Removing someone revokes access but leaves their name on the work they did, on orders and in
        the activity log.
      </Footnote>
    </>
  );
}
