import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/marketing/site-copy";

function IconFacebook(props) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"
      />
    </svg>
  );
}

function IconInstagram(props) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5A4.25 4.25 0 0 0 7.75 20.5h8.5a4.25 4.25 0 0 0 4.25-4.25v-8.5A4.25 4.25 0 0 0 16.25 3.5zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 1.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm5.25-3.75a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"
      />
    </svg>
  );
}

function IconTikTok(props) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.65 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"
      />
    </svg>
  );
}

function IconYouTube(props) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
      />
    </svg>
  );
}

function IconLinkedIn(props) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
      />
    </svg>
  );
}

function IconPinterest(props) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.402.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"
      />
    </svg>
  );
}

function IconX(props) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}

const FALLBACK_URL = "https://resumora.net";

export default function FooterSocialStrip({ variant = "default" }) {
  const { lang } = useLanguage();
  const t = translations[lang];

  const links = {
    facebook: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK || FALLBACK_URL,
    instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM || FALLBACK_URL,
    tiktok: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK || FALLBACK_URL,
    youtube: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE || FALLBACK_URL,
    linkedin: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN || FALLBACK_URL,
    pinterest: process.env.NEXT_PUBLIC_SOCIAL_PINTEREST || FALLBACK_URL,
    x: process.env.NEXT_PUBLIC_SOCIAL_X || FALLBACK_URL,
  };

  const items = [
    { key: "facebook", href: links.facebook, label: "Facebook", Icon: IconFacebook },
    { key: "instagram", href: links.instagram, label: "Instagram", Icon: IconInstagram },
    { key: "tiktok", href: links.tiktok, label: "TikTok", Icon: IconTikTok },
    { key: "youtube", href: links.youtube, label: "YouTube", Icon: IconYouTube },
    { key: "linkedin", href: links.linkedin, label: "LinkedIn", Icon: IconLinkedIn },
    { key: "pinterest", href: links.pinterest, label: "Pinterest", Icon: IconPinterest },
    { key: "x", href: links.x, label: "X", Icon: IconX },
  ];

  return (
    <div className={`rs-footer-social-dock ${variant === "minimal" ? "rs-footer-social-dock--minimal" : ""}`}>
      <p className="rs-footer-dock-label">{t.footerDockSocial}</p>
      <ul className="rs-footer-social-icons" role="list">
        {items.map(({ key, href, label, Icon }) => (
          <li key={key}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="rs-social-round"
              aria-label={`${label} — ${t.footerSocial}`}
            >
              <Icon />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
