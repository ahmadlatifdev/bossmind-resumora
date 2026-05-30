"use client";

import LuxuryFooter from "@/components/footer/LuxuryFooter";
import FaqSection from "@/components/landing/FaqSection";
import { HeroSection, LanguageToggle, useLandingLang } from "@/components/landing/HeroSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import LuxuryNavbar from "@/components/navbar/LuxuryNavbar";

export default function LuxuryHomePage() {
  const [lang, setLang] = useLandingLang("en");

  return (
    <div className="lux-page">
      <LuxuryNavbar langToggle={<LanguageToggle lang={lang} onChange={setLang} />} />
      <main>
        <HeroSection lang={lang} />
        <TestimonialsSection />
        <FaqSection />
      </main>
      <LuxuryFooter />
    </div>
  );
}
