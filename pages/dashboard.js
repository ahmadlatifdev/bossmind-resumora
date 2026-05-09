import { useEffect, useState } from "react";
import Link from "next/link";

export default function DashboardPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/engagement/stats", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setData({ enabled: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await fetch("/api/engagement/logout", { method: "POST", credentials: "same-origin" });
    window.location.href = "/";
  }

  return (
    <div className="rs-app-shell">
      <main className="rs-simple-card rs-simple-card--wide rs-dash-board-card">
        <h1>Engagement analytics</h1>
        <p style={{ marginTop: "0.75rem", color: "var(--rs-text-secondary)", lineHeight: 1.65 }}>
          Aggregates feed BossMind event logs when Neon is configured. Signed-in state:{" "}
          <strong>{data?.signedIn ? data.email || "session" : "anonymous visitor"}</strong>.
        </p>
        <div style={{ marginTop: "1.5rem", display: "grid", gap: "0.75rem" }}>
          <div>
            <strong>Followers:</strong> {data?.followers ?? "—"}
          </div>
          <div>
            <strong>Registered profiles:</strong> {data?.registrations ?? "—"}
          </div>
          <div>
            <strong>Neon engagement store:</strong> {data?.enabled === false ? "offline" : "online"}
          </div>
        </div>
        <div style={{ marginTop: "1.5rem", display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
          <Link href="/#engagement" className="rs-btn-accent" style={{ textDecoration: "none", display: "inline-flex" }}>
            Back to engagement
          </Link>
          <button type="button" className="rs-btn-ghost" onClick={() => logout()}>
            Sign out
          </button>
          <Link href="/" className="rs-link-muted" style={{ alignSelf: "center" }}>
            Home
          </Link>
        </div>
      </main>
    </div>
  );
}
