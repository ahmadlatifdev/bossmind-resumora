import Link from "next/link";
import Image from "next/image";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/90 backdrop-blur-md border-b border-[#c9a96e]/20">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* REAL RESUMORA LOGO — TOP LEFT */}
        <Link href="/" className="flex items-center gap-3 group">
          <Image 
            src="/images/resumora-logo-396x396.png"
            alt="Resumora"
            width={48}
            height={48}
            className="rounded-sm group-hover:scale-105 transition-transform duration-300"
            priority
          />
          <span className="text-[#c9a96e] font-serif text-xl tracking-wider font-semibold">
            RESUMORA
          </span>
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-8">
          <Link href="/services" className="text-gray-300 hover:text-[#c9a96e] transition-colors text-sm tracking-wide uppercase">
            Services
          </Link>
          <Link href="/about" className="text-gray-300 hover:text-[#c9a96e] transition-colors text-sm tracking-wide uppercase">
            About
          </Link>
          <Link href="/contact" className="text-gray-300 hover:text-[#c9a96e] transition-colors text-sm tracking-wide uppercase">
            Contact
          </Link>
        </div>
      </div>
    </nav>
  );
}
