/**
 * Terms of Service — boilerplate legal page.
 * Replace placeholder contact details before go-live.
 */

import type { ReactNode } from 'react';

const CONTACT_EMAIL = 'support@resumora.net';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold mt-8 mb-3 tracking-wide">{title}</h2>
      <div className="space-y-3 text-sm opacity-90 leading-relaxed">{children}</div>
    </section>
  );
}

export default function TermsOfService() {
  return (
    <section className="legal-page max-w-3xl mx-auto px-4 py-12 text-left">
      <h1 className="v6-heading text-3xl md:text-4xl mb-2">Terms of Service</h1>
      <p className="text-sm opacity-70 mb-6">Last updated: November 4, 2026</p>

      <p className="text-sm opacity-90 leading-relaxed">
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Resumora
        (&ldquo;the Service&rdquo;). By accessing or using the Service, you agree to be bound by
        these Terms.
      </p>

      <Section title="1. Acceptance of Terms">
        <p>
          By creating an account or using the Service, you confirm that you have read, understood,
          and agree to these Terms. If you do not agree, do not use the Service.
        </p>
      </Section>

      <Section title="2. Description of Service">
        <p>
          Resumora provides tools to create, edit, and manage resumes and cover letters, including
          premium features available through paid plans.
        </p>
      </Section>

      <Section title="3. Accounts">
        <p>
          You are responsible for maintaining the confidentiality of your account credentials and
          for all activity under your account. You agree to provide accurate information and to
          notify us of any unauthorized use.
        </p>
      </Section>

      <Section title="4. Subscriptions and Payments">
        <p>
          Paid plans are billed through our payment provider. By purchasing a plan, you agree to the
          applicable fees and billing terms presented at checkout. Subscription renewals and
          cancellations are managed through the billing interface.
        </p>
      </Section>

      <Section title="5. Acceptable Use">
        <p>You agree not to misuse the Service, including by attempting to:</p>
        <p>Violate any applicable law or regulation;</p>
        <p>Upload unlawful, infringing, or malicious content;</p>
        <p>Interfere with the security or operation of the Service;</p>
        <p>Access data or systems you are not authorized to access.</p>
      </Section>

      <Section title="6. Intellectual Property">
        <p>
          The Service and its original content, features, and functionality are owned by Resumora
          and are protected by applicable intellectual property laws. You retain ownership of the
          content you create or upload.
        </p>
      </Section>

      <Section title="7. User Content">
        <p>
          You retain all rights to the resumes, cover letters, and other content you upload or
          create. By using the Service, you grant us a limited license to process and store that
          content solely to provide the Service.
        </p>
      </Section>

      <Section title="8. Disclaimer of Warranties">
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
          warranties of any kind, express or implied, including fitness for a particular purpose. We
          do not guarantee specific outcomes from your use of the Service.
        </p>
      </Section>

      <Section title="9. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, Resumora shall not be liable for any indirect,
          incidental, special, consequential, or punitive damages arising out of your use of the
          Service.
        </p>
      </Section>

      <Section title="10. Indemnification">
        <p>
          You agree to indemnify and hold harmless Resumora and its affiliates from any claims
          arising out of your use of the Service or your violation of these Terms.
        </p>
      </Section>

      <Section title="11. Termination">
        <p>
          We may suspend or terminate your access to the Service for violations of these Terms. You
          may stop using the Service at any time.
        </p>
      </Section>

      <Section title="12. Governing Law">
        <p>
          These Terms are governed by the laws of the jurisdiction in which Resumora operates,
          without regard to conflict-of-law principles.
        </p>
      </Section>

      <Section title="13. Changes to These Terms">
        <p>
          We may modify these Terms from time to time. Material changes will be communicated with
          reasonable notice. Continued use of the Service after changes constitutes acceptance.
        </p>
      </Section>

      <Section title="14. Contact Us">
        <p>
          Questions about these Terms? Email{' '}
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </section>
  );
}
