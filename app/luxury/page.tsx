import dynamic from "next/dynamic";

const LuxuryHomePage = dynamic(
  () =>
    import("@/components/landing/HeroSection").then((mod) => mod.LuxuryHomePage),
  { ssr: false },
);

export default function LuxuryPage() {
  return <LuxuryHomePage />;
}
