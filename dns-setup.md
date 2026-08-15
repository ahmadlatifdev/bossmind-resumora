# DNS setup for `resumora.net` → Firebase Hosting (`resumora-live`)

## Status (from Firebase Hosting API)

| Field | Value |
|-------|--------|
| Project | `resumora-live` |
| Hosting site | `client-resumora-live` |
| Custom domain | `resumora.net` |
| Ownership | `OWNERSHIP_ACTIVE` (already verified) |
| Host state | `HOST_MISMATCH` (DNS still points at old Cloud Run / Google frontend IPs) |
| SSL cert | `CERT_ACTIVE` |

> **CLI note:** `firebase hosting:domains:create` is **not** available in the installed Firebase CLI.  
> The domain was checked/created via the Firebase Hosting REST API (equivalent).  
> Result: `resumora.net` **already exists** on site `client-resumora-live` (HTTP 409 ALREADY_EXISTS on re-create).

---

## Exact TXT records from Firebase

Copy these **exactly** (no quotes) into your DNS provider for **`resumora.net`**.

### 1) Firebase Hosting site TXT (required — currently missing)

| Field | Value |
|-------|--------|
| **Type** | `TXT` |
| **Host / Name** | `@` (or blank / `resumora.net` — use your registrar’s apex/root host) |
| **Value** | `hosting-site=client-resumora-live` |
| **TTL** | `3600` (or default) |

### 2) Google site verification TXT records (keep / ensure present)

| Field | Value |
|-------|--------|
| **Type** | `TXT` |
| **Host / Name** | `@` |
| **Value** | `google-site-verification=_cWKS_urxnYrGDH7BgeaJXdfnWiWqBFkSj3FKQ9WJro` |

| Field | Value |
|-------|--------|
| **Type** | `TXT` |
| **Host / Name** | `@` |
| **Value** | `google-site-verification=uu5WJuNZ2MZf85lDqayb5HPObpkDDgO-YXIgi32NH3I` |

---

## Also required: A record (apex) — fix `HOST_MISMATCH`

Firebase currently sees old Cloud Run-style A records and wants them replaced.

### Remove these A records for Host `@`

- `216.239.32.21`
- `216.239.34.21`
- `216.239.36.21`
- `216.239.38.21`

### Add this A record for Host `@`

| Field | Value |
|-------|--------|
| **Type** | `A` |
| **Host / Name** | `@` |
| **Value** | `199.36.158.100` |
| **TTL** | `3600` |

---

## Step-by-step (GoDaddy / Namecheap / Cloudflare / SquareSpace / etc.)

1. Sign in to the DNS provider that controls **`resumora.net`** nameservers.
2. Open **DNS management** for `resumora.net`.
3. **Delete** any apex (`@`) **A** records pointing to `216.239.32.21`, `216.239.34.21`, `216.239.36.21`, or `216.239.38.21`.
4. **Add** an **A** record:
   - Host: `@`
   - Value: `199.36.158.100`
5. **Add** a **TXT** record:
   - Host: `@`
   - Value: `hosting-site=client-resumora-live`
6. **Confirm** the two `google-site-verification=...` TXT records above exist on `@` (add them if missing).
7. Save all DNS changes.

### Optional: `www.resumora.net`

Firebase also expects:

| Field | Value |
|-------|--------|
| **Type** | `CNAME` |
| **Host** | `www` |
| **Value** | `client-resumora-live.web.app` |

Remove any `www` CNAME that only points at `resumora.net` if it conflicts.

---

## Wait for DNS propagation

After saving DNS records, **wait for DNS propagation** (often **5–60 minutes**, sometimes up to **24–48 hours**).

You can spot-check with:

```powershell
Resolve-DnsName -Name resumora.net -Type TXT
Resolve-DnsName -Name resumora.net -Type A
```

Confirm you see:

- TXT: `hosting-site=client-resumora-live`
- A: `199.36.158.100`
- and that the old `216.239.*.21` A records are gone

---

## Finalize / verify in Firebase

Once propagation looks correct, finalize in either place:

1. **Firebase Console (recommended):** open Hosting → Domains and click **Verify** / wait for status to become connected:  
   https://console.firebase.google.com/project/resumora-live/hosting

2. **CLI retry (if your tools support domain create/verify):**  
   `firebase hosting:domains:create resumora.net`  
   (Not available in the current CLI build used here — use the Console Verify button, or re-check status via the Hosting API / Console.)

Ownership is already `OWNERSHIP_ACTIVE`; after the A + `hosting-site` TXT updates propagate, host state should move off `HOST_MISMATCH` toward a healthy connected host.

---

## Console status URL

**https://console.firebase.google.com/project/resumora-live/hosting**
