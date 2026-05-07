"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Globe, Sparkles } from "lucide-react";

export default function Home() {
  const [lang, setLang] = useState("en");
  const t = lang === "en" ? 
    { title: "Resumora – AI‑Powered Resume & Career", subtitle: "Land your dream job with a professional resume.", cta: "Get Started", pricing: "Pricing", basic: "Basic", pro: "Pro", enterprise: "Enterprise", start: "Start for free", contact: "Contact us" } :
    { title: "Resumora – CV et Carrière IA", subtitle: "Décrochez l'emploi de vos rêves avec un CV professionnel.", cta: "Commencer", pricing: "Tarifs", basic: "Basique", pro: "Pro", enterprise: "Entreprise", start: "Démarrage gratuit", contact: "Contactez‑nous" };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-12">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Resumora</h1>
          <button onClick={() => setLang(lang === "en" ? "fr" : "en")} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm">
            <Globe size={18} /> {lang === "en" ? "FR" : "EN"}
          </button>
        </div>
        <div className="text-center py-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <h2 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-white to-purple-400 bg-clip-text text-transparent">{t.title}</h2>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">{t.subtitle}</p>
            <button className="px-8 py-3 rounded-full bg-purple-600 hover:bg-purple-700 transition flex items-center gap-2 mx-auto">
              <Sparkles size={20} /> {t.cta}
            </button>
          </motion.div>
        </div>
        <div className="grid md:grid-cols-3 gap-8 mt-20">
          {[t.basic, t.pro, t.enterprise].map((plan, i) => (
            <div key={i} className="bg-white/5 rounded-2xl p-8 backdrop-blur-sm border border-white/10 hover:border-purple-500 transition">
              <h3 className="text-2xl font-bold mb-4">{plan}</h3>
              <p className="text-4xl font-bold mb-6">{i === 0 ? "$9" : i === 1 ? "$29" : "Custom"}/mo</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2"><Check size={18} className="text-green-400" /> AI Resume Builder</li>
                <li className="flex items-center gap-2"><Check size={18} className="text-green-400" /> Cover Letter Generator</li>
                {i > 0 && <li className="flex items-center gap-2"><Check size={18} className="text-green-400" /> Priority Support</li>}
                {i > 1 && <li className="flex items-center gap-2"><Check size={18} className="text-green-400" /> API Access</li>}
              </ul>
              <button className="w-full py-2 rounded-lg bg-white/10 hover:bg-purple-600 transition">{i === 0 ? t.start : t.contact}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
