import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="rs-app-shell">
      <main>
        <section className="rs-simple-card rs-simple-card--wide">
          <h1>About Resumora</h1>
          <p>
            Resumora is a premium resume and career brand studio helping professionals secure better interviews and
            stronger compensation outcomes in global markets.
          </p>
          <p>
            Our delivery team includes senior resume strategists, recruiters, LinkedIn specialists, and interview coaches.
          </p>
          <Link href="/" className="rs-link-muted">
            Back to home
          </Link>
        </section>
      </main>
    </div>
  );
}
