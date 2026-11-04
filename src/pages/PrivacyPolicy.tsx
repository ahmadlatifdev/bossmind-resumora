/**
 * Privacy Policy — boilerplate legal page (GDPR / CCPA aware).
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

export default function PrivacyPolicy() {
  return (
    <section className="legal-page max-w-3xl mx-auto px-4 py-12 text-left">
      <h1 className="v6-heading text-3xl md:text-4xl mb-2">Privacy Policy</h1>
      <p className="text-sm opacity-70 mb-6">Last updated: November 4, 2026</p>

      <p className="text-sm opacity-90 leading-relaxed">
        Resumora (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) respects your privacy. This
        Privacy Policy explains what personal information we collect, how we use it, and the rights
        you have under applicable data protection laws, including the EU/UK General Data Protection
        Regulation (&ldquo;GDPR&rdquo;) and the California Consumer Privacy Act
        (&ldquo;CCPA&rdquo;).
      </p>

      <Section title="1. Information We Collect">
        <p>
          <strong>Account information</strong> — name, email address, and authentication identifiers
          when you create an account.
        </p>
        <p>
          <strong>Usage information</strong> — pages visited, features used, and interactions with
          the platform, collected via cookies and analytics.
        </p>
        <p>
          <strong>Content you provide</strong> — resumes, cover letters, and other documents you
          upload or create on the platform.
        </p>
        <p>
          <strong>Payment information</strong> — billing details processed by our payment provider
          (Stripe). We do not store full card numbers on our servers.
        </p>
      </Section>

      <Section title="2. How We Use Your Information">
        <p>To provide, operate, and improve the platform and its features.</p>
        <p>To process payments and manage subscriptions.</p>
        <p>To send service communications, including password resets and receipts.</p>
        <p>To personalize your experience and provide customer support.</p>
        <p>To maintain security and prevent fraud or abuse.</p>
      </Section>

      <Section title="3. Legal Bases for Processing (GDPR)">
        <p>
          <strong>Performance of a contract</strong> — to deliver the services you request.
        </p>
        <p>
          <strong>Legitimate interests</strong> — to secure the platform, prevent fraud, and improve
          our products.
        </p>
        <p>
          <strong>Consent</strong> — where required, such as non-essential cookies and marketing
          communications.
        </p>
      </Section>

      <Section title="4. Cookies and Similar Technologies">
        <p>
          We use cookies and similar technologies for essential functionality, analytics, and
          performance. Non-essential cookies are only enabled with your consent, which you can
          manage or withdraw at any time via the cookie banner and your browser settings.
        </p>
      </Section>

      <Section title="5. Sharing and Third-Party Providers">
        <p>
          We share personal information only with service providers who help us operate the platform
          (for example, payment processing, hosting, email delivery, and analytics) and only to the
          extent necessary to perform those services. We do not sell your personal information.
        </p>
      </Section>

      <Section title="6. Data Retention">
        <p>
          We retain personal information for as long as necessary to provide the services and
          satisfy legal, accounting, and security obligations, after which it is deleted or
          anonymized.
        </p>
      </Section>

      <Section title="7. Your Rights">
        <p>
          Under the GDPR, you have the right to access, rectify, erase, restrict, and port your
          personal data, and to object to certain processing. Under the CCPA, California residents
          have the right to know what personal information is collected, to request deletion, and to
          opt out of the &ldquo;sale&rdquo; of personal information (we do not sell personal
          information). To exercise any right, contact us at{' '}
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="8. International Data Transfers">
        <p>
          Your information may be processed in countries outside your own. Where applicable, we rely
          on appropriate safeguards for such transfers as required by law.
        </p>
      </Section>

      <Section title="9. Children's Privacy">
        <p>
          The platform is not directed to children under 16, and we do not knowingly collect
          personal information from children. If you believe a child has provided us personal
          information, please contact us and we will delete it.
        </p>
      </Section>

      <Section title="10. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. Changes will be posted on this page
          with an updated &ldquo;Last updated&rdquo; date.
        </p>
      </Section>

      <Section title="11. Contact Us">
        <p>
          Questions about this policy? Email{' '}
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </section>
  );
}
