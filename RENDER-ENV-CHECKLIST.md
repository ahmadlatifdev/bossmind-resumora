# Resumora — Render + Stripe Canonical Enforcement Checklist

## 1. Render Environment Variables

Open: Render Dashboard → bossmind-resumora-web → Environment

### Required (add if missing):

| Variable | Required Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://resumora.net` |

### Verify these are NOT set to onrender.com:

| Variable | Must NOT contain |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `onrender.com`, `localhost` |
| `NEXTAUTH_URL` | `onrender.com` (should be `https://resumora.net`) |

### NEXTAUTH_URL specifically:

```
NEXTAUTH_URL=https://resumora.net
```

NextAuth uses this for callback URLs and session cookies. If it points
to onrender.com, login redirects will land on the wrong domain.

---

## 2. Stripe Dashboard Settings

Open: dashboard.stripe.com → Settings → Business settings → Public details

### Success + Cancel URLs

In your Stripe Checkout session creation code (server-side), verify:

```js
success_url: "https://resumora.net/studio?checkout=success&session_id={CHECKOUT_SESSION_ID}",
cancel_url:  "https://resumora.net/pricing#pricing",
```

NOT:
```js
// WRONG — these must not appear in production
success_url: "http://localhost:3000/...",
success_url: "https://bossmind-resumora-web.onrender.com/...",
```

### Webhook Endpoint

Open: Stripe Dashboard → Developers → Webhooks

Your webhook endpoint URL should point to:
```
https://resumora.net/api/stripe/webhook
```
OR the Render URL is acceptable for webhooks ONLY:
```
https://bossmind-resumora-web.onrender.com/api/stripe/webhook
```
(Stripe calls this directly; it bypasses the canonical redirect.
 The middleware.js and next.config.js both exclude /api/stripe/* from
 redirect, so either URL works for webhooks.)

---

## 3. Google Search Console

1. Go to: search.google.com/search-console
2. Add property: `https://resumora.net` (if not already added)
3. Verify ownership (DNS TXT record or HTML file method)
4. Submit sitemap: `https://resumora.net/sitemap.xml`
5. Check "Coverage" report for any pages indexed under bossmind-resumora-web.onrender.com
6. Use "URL Inspection" tool on the Render URL — it should show "redirect to resumora.net"

---

## 4. Social Media Cache Refresh

After deploying the canonical redirect, force social platforms to re-crawl:

### Facebook / Instagram
URL: https://developers.facebook.com/tools/debug/
Action: Paste `https://resumora.net` → click "Scrape Again"

### LinkedIn
URL: https://www.linkedin.com/post-inspector/
Action: Paste URL → click "Inspect"

### Twitter / X
URL: https://cards-dev.twitter.com/validator
Action: Paste URL → click "Preview card"

### Pinterest
URL: https://developers.pinterest.com/tools/url-debugger/
Action: Paste URL → validate

---

## 5. Google Ads / Marketing Links

Update any Google Ads campaigns, landing page URLs, or UTM links to use:
```
https://resumora.net/
https://resumora.net/pricing
https://resumora.net/services
```

NOT:
```
https://bossmind-resumora-web.onrender.com/...
```

---

## 6. Deploy Sequence

1. Add `NEXT_PUBLIC_SITE_URL=https://resumora.net` to Render env vars
2. Add `NEXTAUTH_URL=https://resumora.net` to Render env vars
3. Deploy these files:
   - `next.config.js` → project root (replace existing)
   - `middleware.js` → project root (new file)
   - `lib/marketing/seo-config.js` → replace existing
   - `public/robots.txt` → replace existing
   - `public/sitemap.xml` → replace existing (or use dynamic generator)
4. Trigger redeploy on Render
5. Test: visit `https://bossmind-resumora-web.onrender.com/` in browser
   → should 308 redirect to `https://resumora.net/`
6. Test: visit `https://bossmind-resumora-web.onrender.com/pricing`
   → should 308 redirect to `https://resumora.net/pricing`
7. Test webhook still works: use Stripe CLI to send a test event
   → `stripe trigger checkout.session.completed`

---

## 7. Verification Commands

```bash
# Test redirect from Render domain (run from your terminal)
curl -I https://bossmind-resumora-web.onrender.com/
# Expected: HTTP/2 308, Location: https://resumora.net/

# Test canonical URL loads correctly
curl -I https://resumora.net/
# Expected: HTTP/2 200

# Test webhook path NOT redirected
curl -I https://bossmind-resumora-web.onrender.com/api/stripe/webhook
# Expected: HTTP/2 405 (method not allowed) or 200 — NOT 308

# Verify OG tags on homepage
curl -s https://resumora.net/ | grep -E "og:url|og:image|canonical"
# Expected: all URLs contain resumora.net
```
