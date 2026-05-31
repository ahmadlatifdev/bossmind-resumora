import {
  BriefcaseBusiness,
  FileText,
  Headphones,
  Languages,
  Mic2,
  PenLine,
  type LucideIcon,
} from "lucide-react";

import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

export type MarketingLocale = "en" | "fr";

export const SERVICE_KEYS = [
  "ats",
  "coverLetter",
  "linkedin",
  "interview",
  "translation",
  "prioritySupport",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

export const FAQ_KEYS = ["bilingual", "mobile", "gettingStarted"] as const;

export type FaqKey = (typeof FAQ_KEYS)[number];

type ServiceCopy = { title: string; description: string; cta: string };

type FaqCopy = { question: string; answer: string };

export type MarketingMessages = {
  services: { sectionTitle: string } & Record<ServiceKey, ServiceCopy>;
  faq: { sectionTitle: string } & Record<FaqKey, FaqCopy>;
};

const messages: Record<MarketingLocale, MarketingMessages> = { en, fr };

const SERVICE_RESOURCE_KEYS: Record<ServiceKey, string> = {
  ats: "svc_ats",
  coverLetter: "svc_letter",
  linkedin: "svc_linkedin",
  interview: "svc_interview",
  translation: "svc_tls",
  prioritySupport: "svc_support",
};

const SERVICE_ICONS: Record<ServiceKey, LucideIcon> = {
  ats: FileText,
  coverLetter: PenLine,
  linkedin: BriefcaseBusiness,
  interview: Mic2,
  translation: Languages,
  prioritySupport: Headphones,
};

export function resolveMarketingLocale(lang: string): MarketingLocale {
  return lang === "fr" ? "fr" : "en";
}

export function getMarketingMessages(lang: string): MarketingMessages {
  return messages[resolveMarketingLocale(lang)];
}

export type ServiceCard = ServiceCopy & {
  key: ServiceKey;
  resourceKey: string;
  Icon: LucideIcon;
};

export function getServiceCards(lang: string): ServiceCard[] {
  const copy = getMarketingMessages(lang).services;
  return SERVICE_KEYS.map((key) => ({
    key,
    resourceKey: SERVICE_RESOURCE_KEYS[key],
    title: copy[key].title,
    description: copy[key].description,
    cta: copy[key].cta,
    Icon: SERVICE_ICONS[key],
  }));
}

export type FaqItem = FaqCopy & { id: FaqKey };

export function getFaqItems(lang: string): FaqItem[] {
  const copy = getMarketingMessages(lang).faq;
  return FAQ_KEYS.filter((id) => copy[id]?.answer?.length > 0).map((id) => ({
    id,
    question: copy[id].question,
    answer: copy[id].answer,
  }));
}
