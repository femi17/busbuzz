import type { Metadata } from 'next';
import { LegalShell, Section, P, Bullets, Mail } from '@/components/legal/LegalShell';

export const metadata: Metadata = {
  title: 'Privacy Policy — BusBuzz',
  description: 'How BusBuzz collects, uses, and protects the personal data of schools, parents, drivers, and students.',
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="11 July 2026"
      intro="Your trust is the whole point of BusBuzz. This policy explains what personal data we collect, why, how we protect it, and the choices you have. We handle personal data in line with the Nigeria Data Protection Act 2023 (NDPA) and the NDPR."
    >
      <Section n={1} heading="Who this covers">
        <P>
          This policy applies to everyone whose data passes through BusBuzz: <strong>schools</strong> and their
          administrators, <strong>parents and guardians</strong>, <strong>drivers</strong>, and the
          <strong> students</strong> whose journeys are tracked.
        </P>
      </Section>

      <Section n={2} heading="Our role — controller and processor">
        <P>
          For account data belonging to school administrators, parents, and drivers, BusBuzz is the
          <strong> data controller</strong>. For <strong>student</strong> information, which schools enter to run their
          transport, BusBuzz acts as a <strong>data processor</strong> on the school&rsquo;s behalf and only on the
          school&rsquo;s instructions. You can reach us about any privacy matter at <Mail />.
        </P>
      </Section>

      <Section n={3} heading="Information we collect">
        <P>We collect only what we need to run the service:</P>
        <Bullets
          items={[
            'From school administrators: name, email address, and school details.',
            'From parents and guardians: name, email address, phone number, the children linked to them, and a device token used to deliver push notifications.',
            'From drivers: name, phone number, assigned bus, and a 4-digit sign-in PIN, which is stored only in hashed form — we never keep it in plain text.',
            'About students (provided by the school): name, class, an optional photo, and their assigned route and stop; plus boarding and attendance records created during trips.',
            'Bus location: GPS coordinates broadcast by the driver’s mounted device while a trip is active.',
            'Technical data: basic app and device information needed to deliver notifications and keep the service secure.',
          ]}
        />
      </Section>

      <Section n={4} heading="Location data — what is and isn’t tracked">
        <P>
          BusBuzz tracks the <strong>bus</strong>, not people. Location comes only from the driver&rsquo;s mounted
          device, and only while a trip is active. The <strong>parent app does not track a parent&rsquo;s phone or a
          child&rsquo;s phone</strong> &mdash; it simply displays where the bus is. Location breadcrumbs are kept for a
          rolling 30 days so parents and schools can review recent trips, and are then automatically deleted.
        </P>
      </Section>

      <Section n={5} heading="How we use your information">
        <Bullets
          items={[
            'To show the live location of a child’s bus to their linked parents.',
            'To send approaching, boarded, dropped-off, and arrival notifications.',
            'To record attendance and produce trip and attendance reports for the school.',
            'To operate driver sign-in, manage devices, and provide support.',
            'To keep the service secure, prevent misuse, and meet our legal obligations.',
          ]}
        />
        <P>We do not use children&rsquo;s data for advertising, and we never sell personal data.</P>
      </Section>

      <Section n={6} heading="Children’s data">
        <P>
          Student data is collected from, and processed on behalf of, the school under its authority as part of
          providing school transport. It is used only to deliver the service &mdash; for example, to let a driver mark
          a child as boarded and to notify that child&rsquo;s linked parents. It is not used for marketing and is not
          shared beyond the recipients described below.
        </P>
      </Section>

      <Section n={7} heading="Who we share it with">
        <P>We share personal data only where necessary, and never with advertisers. Specifically:</P>
        <Bullets
          items={[
            'With the child’s school, which controls its own students’ records.',
            'With a parent, who can see only their own linked child’s bus and updates — access is enforced at the database level so families cannot see one another’s data.',
            'With the service providers that power BusBuzz: our cloud database and authentication host (Supabase), the push-notification service (Expo), mapping (Google Maps), and our email provider. These providers process data on our behalf under their own safeguards.',
            'Where we are required to by law, or to protect the safety and rights of users.',
          ]}
        />
      </Section>

      <Section n={8} heading="Notifications">
        <P>
          Parents receive push notifications about their child&rsquo;s trip through the Expo push service. You can turn
          notifications off at any time in your device settings; the app will still show live tracking when you open
          it.
        </P>
      </Section>

      <Section n={9} heading="How long we keep data">
        <Bullets
          items={[
            'Bus location breadcrumbs: 30 days, then deleted automatically.',
            'In-app notification history: 90 days.',
            'Account, student, route, and attendance records: for as long as the account is active and the school needs them, and then deleted or anonymised on request or account closure.',
          ]}
        />
      </Section>

      <Section n={10} heading="How we protect your data">
        <Bullets
          items={[
            'Data is encrypted in transit.',
            'Access is enforced by row-level security, so each account can reach only the data it is entitled to.',
            'Student photos are stored in private storage and served only through short-lived, signed links.',
            'Driver PINs are stored only as hashes, never in plain text.',
          ]}
        />
      </Section>

      <Section n={11} heading="Your rights">
        <P>Under the NDPA you have the right to:</P>
        <Bullets
          items={[
            'Access the personal data we hold about you.',
            'Correct data that is inaccurate or incomplete.',
            'Request deletion of your data, subject to any legal obligations.',
            'Object to or restrict certain processing, and withdraw consent where processing relies on it.',
            'Request a copy of your data in a portable form.',
          ]}
        />
        <P>
          To exercise any of these, email <Mail />. Parents can also raise requests about a child&rsquo;s data with
          their school, which controls those records. We will respond within the timeframes set by law.
        </P>
      </Section>

      <Section n={12} heading="Deleting your account">
        <P>
          Parents can delete their BusBuzz account and associated personal data directly from the parent app. Schools
          can request removal of their data by contacting us. Some records may be retained where the law requires.
        </P>
      </Section>

      <Section n={13} heading="Where your data is processed">
        <P>
          BusBuzz uses reputable cloud providers that may store or process data on servers located outside Nigeria
          (for example, in the European Union). Where data is transferred internationally, we rely on providers that
          apply appropriate safeguards and contractual protections consistent with the NDPA.
        </P>
      </Section>

      <Section n={14} heading="Changes to this policy">
        <P>
          We may update this policy as the service evolves or the law changes. We will revise the date above and,
          for material changes, notify schools. Please check back from time to time.
        </P>
      </Section>

      <Section n={15} heading="Contact us">
        <P>
          For any privacy question or request, contact our team at <Mail />. We take every request seriously and
          will get back to you promptly.
        </P>
      </Section>
    </LegalShell>
  );
}
