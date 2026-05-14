# Resumora — Google Business Profile (GBP) & global visibility playbook

**Critical boundary:** Google Business Profile (Maps) **cannot** be updated “hands-free” from this Git repository without **Google Business Profile API** credentials, **OAuth**, and **owner/admin approval**. This document gives the **advanced optimization strategy**, a **checklist** (`config/resumora-google-business-profile-checklist.json`), cross-channel consistency rules, and a **Neon audit hook** after you finish changes in Google.

**Anti-leak:** Never commit OAuth client secrets, refresh tokens, or service-account JSON. Store only in **Render / Railway / Google Secret Manager**.

---

## 1. What “fully automated” actually requires

| Layer | In this repo | In Google / ops |
|-------|----------------|-----------------|
| Attribute updates (appointments, languages, services) | **Not automated** | GBP UI or **Business Profile API** |
| “Auto-fix weak signals” on Maps | **Not possible** here | Reviews, photos, Q&A, categories — human + policy |
| Public / global visibility verification | **Not automated** | Search Console, Maps URL checks, `site:` queries |
| Lock state in BossMind memory | **PARTIAL** | Run **`npm run resumora:gbp:confirm`** after manual GBP work (Neon `event_log` + `task_state` + `last_confirmed_checkpoint` **`google_business_profile_optimized_state`**) |
| Live site vs checklist audit (no Google API) | **ACTIVE** | **`npm run resumora:gbp:audit`** — optional **`--persist-neon`**, **`--json-out=...`**, **`--fail-on-warn`** |

---

## 2. Recommended GBP attributes (align with checklist JSON)

Set or verify in **Google Business Profile** (edit business):

1. **Primary category** — closest fit (e.g. résumé / career counselor taxonomy available in your region). Avoid unrelated categories.  
2. **Additional categories** — only if truly accurate (secondary services).  
3. **Virtual / online service** — **Yes** (global delivery).  
4. **Online appointments** — **Yes**, link to **`https://resumora.net/contact`** (or your live booking URL).  
5. **Online estimates** — **Yes** if you publish scoped estimates; align copy with **`/pricing`**.  
6. **Appointment required** — **Yes** if studio process is intake-led (recommended for Resumora positioning).  
7. **Languages** — **English**, **French** (and “multilingual” if GBP offers it).  
8. **Service area** — Prefer **online / worldwide** plus any real physical service areas you legally serve.  
9. **Services / products list** — Mirror highlights from checklist: ATS, executive, bilingual, LinkedIn, interview, cover letters, coaching.  
10. **Description** — Short, factual, aligned with **`https://resumora.net`** meta (no unverifiable superlatives, no medical/legal claims).  
11. **Website** — **`https://resumora.net`** (exact HTTPS, no stale domain).  
12. **Opening date / hours** — Accurate; use **special hours** for holidays if needed.

---

## 3. Cross-channel consistency (website + social + GBP)

| Channel | Must match |
|---------|------------|
| **GBP business name** | Legal/trademark name you use publicly (“Resumora” + allowed descriptor per Google rules). |
| **GBP description** | Same value props as homepage lead (EN); add FR only if GBP supports secondary description or posts. |
| **Website canonical** | `NEXT_PUBLIC_SITE_URL` on Render = **`https://resumora.net`**. |
| **Social profiles** | `NEXT_PUBLIC_SOCIAL_*` in env — same URLs in GBP “social links” if available. |
| **Logo / cover** | Same assets as site branding (no conflicting old logos). |

Detect **conflicts:** search Maps for duplicate listings; merge or mark closed per [Google guidelines](https://support.google.com/business/).

---

## 4. Validation checklist (operator)

After GBP edits, **manually** verify:

- [ ] **Public visibility:** Incognito window, signed-out Google — search brand + city/service area; listing appears.  
- [ ] **Maps discoverability:** Maps search “Resumora” / “resume service” + region.  
- [ ] **Mobile:** Same checks on phone; click-to-call / website opens **resumora.net**.  
- [ ] **Indexing quality:** Search Console — `site:resumora.net` and URL Inspection for homepage.  
- [ ] **AI / organic snippets:** spot-check SERP; no guarantee of AI Overview inclusion.  
- [ ] **No duplicate GBP** for same address/phone.  
- [ ] **Branding:** Logo, name, domain consistent with live site.

---

## 5. Missing optimization points (common gaps)

- **Photos:** Team, workspace (if applicable), anonymised deliverable samples (per client permission).  
- **Google Posts:** Monthly posts linking to **`/pricing`**, **`/solutions/ats-resume`**, **`/resources`**.  
- **Q&A:** Seed factual FAQs (hours, languages, delivery, ATS) — no spam links.  
- **Reviews:** Ethical solicitation post-service; reply to all reviews.  
- **Products/Services depth:** Match new solution URLs on the site where relevant.

---

## 6. “Lock” into BossMind shared memory (audit trail)

After you confirm GBP matches the checklist:

```bash
npm run resumora:gbp:audit
npm run resumora:gbp:confirm -- --i-understand-manual-only --notes="GBP: virtual+EN/FR+services aligned to resumora.net 2026-05-14"
```

With live-site summary embedded in Neon (still no Google API calls from the repo):

```bash
npm run resumora:gbp:confirm -- --i-understand-manual-only --with-visibility-audit --notes="GBP aligned checklist v2 + live audit"
```

Optional:

```bash
npm run resumora:gbp:confirm -- --i-understand-manual-only --notes="..." --maps-url="https://www.google.com/maps?..."
```

Requires **`NEON_DATABASE_URL`**. Writes:

- `task_state` key **`google_business_profile:resumora_operator_sync`** (status `verified`)  
- `event_log` type **`google_business_profile_operator_confirmed`**  
- `last_confirmed_checkpoint` key **`google_business_profile_optimized_state`** (checklist hash + optional audit summary)

This is an **audit checkpoint**, not a technical lock on Google’s servers.

---

## 7. Final confirmation report (template)

Copy and fill after validation:

| Item | Status (OK / Issue) | Evidence |
|------|---------------------|----------|
| GBP website URL | | |
| Virtual / online flags | | |
| EN + FR languages | | |
| Appointments / estimates | | |
| Categories accurate | | |
| No duplicate listing | | |
| resumora.net canonical match | | |
| Social URLs match | | |
| Mobile listing OK | | |
| Neon audit row recorded | | `npm run resumora:gbp:confirm` output |

---

## References

- `config/resumora-google-business-profile-checklist.json`  
- `docs/BOSSMIND_SEO_GOOGLE_ACTIVATION_REPORT.md`  
- `docs/BOSSMIND_GOOGLE_ORGANIC_GROWTH_ARCHITECTURE.md`  
- Google: [Business Profile API](https://developers.google.com/my-business/reference/rest) (future automation)
