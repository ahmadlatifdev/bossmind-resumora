import Link from "next/link";

export default function AboutPage() {
  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1>About Resumora</h1>
        <p>
          Resumora is a premium resume and career brand studio helping professionals secure
          better interviews and stronger compensation outcomes in global markets.
        </p>
        <p>
          Our delivery team includes senior resume strategists, recruiters, LinkedIn
          specialists, and interview coaches.
        </p>
        <Link href="/" style={styles.link}>Back to home</Link>
      </section>
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#090f23", color: "#f8f5ee", padding: "20px", fontFamily: "Inter, Segoe UI, Arial, sans-serif" },
  card: { maxWidth: "840px", margin: "0 auto", border: "1px solid rgba(212,175,55,.35)", borderRadius: "16px", padding: "24px", background: "rgba(8,17,41,.8)" },
  link: { color: "#f4ddb0", display: "inline-block", marginTop: "12px" },
};
