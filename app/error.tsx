"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>Something went wrong</h1>
      <p style={{ color: "#666", marginBottom: "1.5rem", maxWidth: "28rem" }}>
        We&apos;ve been notified and are looking into it. You can try again.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        style={{
          padding: "0.625rem 1.25rem",
          borderRadius: "0.375rem",
          border: "1px solid #ccc",
          background: "#fff",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
