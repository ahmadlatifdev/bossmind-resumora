const fs = require("fs");

const paths = [
  "d:/BossMind/bossmind-resumora/.env.local",
  "d:/BossMind/bossmind-resumora/functions/.env",
  "d:/BossMind/bossmind-resumora/.env",
];

for (const p of paths) {
  if (!fs.existsSync(p)) {
    console.log("skip missing", p);
    continue;
  }
  let t = fs.readFileSync(p, "utf8");
  const before = t;
  t = t.replace(
    /^(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY|VITE_STRIPE_PUBLISHABLE_KEY)=(.*)$/gm,
    (m, k, v) => {
      const cleaned = String(v)
        .trim()
        .replace(/^["']|["']$/g, "");
      const match = cleaned.match(/^(pk_(?:test|live)_[A-Za-z0-9]+)/);
      if (!match) return m;
      return `${k}=${match[1]}`;
    }
  );
  if (t !== before) {
    fs.writeFileSync(p, t);
    console.log("sanitized", p);
  } else {
    console.log("clean", p);
  }
}
