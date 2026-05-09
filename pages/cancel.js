import Link from "next/link";

export default function Cancel() {
  return (
    <div className="rs-app-shell">
      <main className="rs-simple-card" style={{ textAlign: "center" }}>
        <h1>Payment cancelled</h1>
        <p>No charges were made.</p>
        <p>
          You can return to{" "}
          <Link href="/" className="rs-shell-link">
            Resumora
          </Link>{" "}
          and choose another plan.
        </p>
      </main>
    </div>
  );
}
