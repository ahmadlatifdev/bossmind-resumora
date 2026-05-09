import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="rs-app-shell">
      <main>
        <section className="rs-simple-card rs-simple-card--wide">
          <h1>Terms of service</h1>
          <p>
            By using Resumora, you agree to receive digital career services delivered through our platform, including
            resume writing, profile optimization, and coaching packages.
          </p>
          <p>
            Service timelines begin after required client files are submitted. Premium packages include revision windows as
            detailed in your selected plan.
          </p>
          <Link href="/" className="rs-link-muted">
            Back to home
          </Link>
        </section>
      </main>
    </div>
  );
}
