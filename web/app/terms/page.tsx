import type { Metadata } from 'next';
import { LegalShell, Section, P, Bullets, Mail } from '@/components/legal/LegalShell';

export const metadata: Metadata = {
  title: 'Terms & Conditions — BusBuzz',
  description: 'The terms that govern schools, parents, and drivers using the BusBuzz school bus tracking service.',
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms & Conditions"
      updated="11 July 2026"
      intro="These Terms govern your use of BusBuzz — a fully managed school bus tracking service. By subscribing to BusBuzz, or by using the BusBuzz parent or driver apps, you agree to these Terms. Please read them carefully."
    >
      <Section n={1} heading="Who we are">
        <P>
          BusBuzz (&ldquo;BusBuzz&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) provides real-time school bus tracking for private
          schools across Nigeria. We supply a pre-configured tracking device for each bus, the mobile data
          connection, a parent app, a driver app, and a web dashboard for school administrators.
        </P>
        <P>
          These Terms apply to three groups: <strong>schools</strong> that subscribe to the service,
          <strong> parents and guardians</strong> who use the parent app, and <strong>drivers</strong> who use the
          driver app. &ldquo;You&rdquo; means whichever of these applies to you.
        </P>
      </Section>

      <Section n={2} heading="The service">
        <P>BusBuzz is a managed service. In summary, we provide:</P>
        <Bullets
          items={[
            'A tracking device (a pre-configured Android phone) mounted in each subscribed bus, which broadcasts the bus’s GPS location during active trips.',
            'The SIM card and mobile data plan that keep the device connected.',
            'A parent app (iOS and Android) that shows the live location of a child’s bus and sends approaching, boarded, and arrival alerts.',
            'A driver app used to start a trip, mark students as boarded, and end the trip.',
            'A school admin dashboard to manage buses, routes, stops, students, drivers, and reports.',
          ]}
        />
        <P>
          BusBuzz is an information and convenience service. It is <strong>not</strong> an emergency, security, or
          child-supervision service, and it does not replace the school&rsquo;s own duty of care over students.
        </P>
      </Section>

      <Section n={3} heading="Accounts and access">
        <P>
          The school is responsible for its account and for the accounts it creates. School administrators invite
          parents and add drivers through the dashboard. Drivers sign in with a phone number and a 4-digit PIN set
          by the school.
        </P>
        <P>
          You agree to provide accurate information, to keep your login credentials and driver PINs confidential,
          and to notify us promptly of any unauthorised use. You are responsible for activity that occurs under your
          account.
        </P>
      </Section>

      <Section n={4} heading="Subscriptions, fees and payment">
        <P>BusBuzz is billed per bus. Current plans are:</P>
        <Bullets
          items={[
            'Monthly — ₦12,000 per bus, per month.',
            'Per term — ₦33,000 per bus, per term.',
            'Annual — ₦120,000 per bus, per year.',
          ]}
        />
        <P>
          Each plan includes the device, SIM and data, both apps, the dashboard, and support. There are no setup
          fees. Fees are payable in advance for the billing period. We may change our prices, but we will give you
          reasonable notice before a change affects your next renewal.
        </P>
      </Section>

      <Section n={5} heading="Device deposit and equipment">
        <P>
          A refundable device deposit of <strong>&#8358;20,000 per bus</strong> is collected before installation. The
          tracking devices, SIMs, and mounts remain the property of BusBuzz at all times &mdash; they are provided
          on loan for the duration of your subscription.
        </P>
        <Bullets
          items={[
            'You agree to keep each device mounted and powered in the assigned bus, and not to tamper with, repair, re-configure, or install other software on it.',
            'If a device is lost or damaged, the deposit covers replacement, and we will ship a pre-configured replacement — most within 48 hours.',
            'When your subscription ends, you agree to return the devices in working order. On return, the deposit is refunded less any amount owed for loss or damage.',
          ]}
        />
      </Section>

      <Section n={6} heading="Your responsibilities">
        <P>To get the most from BusBuzz, and to keep it accurate, you agree to:</P>
        <Bullets
          items={[
            'Provide correct route, stop, and student information and keep it up to date.',
            'Ensure drivers start and end trips and mark attendance as intended.',
            'Only link a parent to a student where you are authorised to do so, and keep parent contact details current.',
            'Use the service lawfully and only for its intended purpose of school transport tracking.',
          ]}
        />
      </Section>

      <Section n={7} heading="Acceptable use">
        <P>You agree not to:</P>
        <Bullets
          items={[
            'Use tracking data to harass, stalk, or endanger any person, or for any unlawful purpose.',
            'Resell, sublicense, or provide the service to third parties who are not authorised users of your school.',
            'Copy, reverse-engineer, or attempt to extract the source code of the apps or dashboard, or probe or bypass our security.',
            'Interfere with the service, the devices, or the networks that support them.',
          ]}
        />
      </Section>

      <Section n={8} heading="Availability and GPS accuracy">
        <P>
          We work hard to keep BusBuzz available and accurate, but location depends on GPS satellites and mobile
          networks that are outside our control. Location may be delayed, approximate, or temporarily unavailable in
          areas of poor coverage, and alerts may occasionally be late or missed.
        </P>
        <P>
          The service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. Do not rely on it as
          the sole means of confirming a child&rsquo;s safety or whereabouts.
        </P>
      </Section>

      <Section n={9} heading="Cancellation and termination">
        <P>
          There is no lock-in. A school may cancel at any time, effective at the end of the current billing period;
          the devices are then returned and the deposit refunded as described above. We may suspend or terminate the
          service for non-payment, breach of these Terms, or misuse that risks the safety of users or the integrity
          of the service.
        </P>
      </Section>

      <Section n={10} heading="Limitation of liability">
        <P>
          To the fullest extent permitted by law, BusBuzz is not liable for indirect or consequential loss, or for
          loss arising from GPS or network inaccuracy, delayed or missed alerts, or service interruptions. Nothing in
          these Terms limits liability that cannot be limited by law, including for death or personal injury caused
          by our negligence.
        </P>
        <P>
          Where liability is not excluded, our total liability to a school in any 12-month period is limited to the
          fees that school paid to BusBuzz in that period.
        </P>
      </Section>

      <Section n={11} heading="Data protection">
        <P>
          Our handling of personal data &mdash; including the location of buses, and information about parents,
          drivers, and students &mdash; is described in our Privacy Policy, and is carried out in line with the
          Nigeria Data Protection Act 2023. For student data, BusBuzz acts as a data processor on behalf of the
          school.
        </P>
      </Section>

      <Section n={12} heading="Changes to these Terms">
        <P>
          We may update these Terms from time to time. If we make a material change, we will update the date above
          and, where appropriate, notify schools. Continuing to use BusBuzz after a change means you accept the
          updated Terms.
        </P>
      </Section>

      <Section n={13} heading="Governing law">
        <P>
          These Terms are governed by the laws of the Federal Republic of Nigeria, and any disputes are subject to
          the jurisdiction of the Nigerian courts.
        </P>
      </Section>

      <Section n={14} heading="Contact us">
        <P>
          Questions about these Terms? Email us at <Mail />. We&rsquo;re happy to help.
        </P>
      </Section>
    </LegalShell>
  );
}
