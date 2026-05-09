import Link from "next/link";

export default function ContactPage() {
  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1>Contact</h1>
        <p>Email: support@resumora.net</p>
        <p>Business Hours: Monday to Friday, 09:00-18:00 EST</p>
        <p>Enterprise Partnerships: partnerships@resumora.net</p>
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
