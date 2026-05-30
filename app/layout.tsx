import type { Metadata } from "next";

import "@/styles/luxury/globals.css";

export const metadata: Metadata = {
  title: "Resumora | Luxury AI Resume Intelligence",
  description:
    "Enterprise-grade, AI-powered resume optimization with luxury design and bilingual delivery.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
