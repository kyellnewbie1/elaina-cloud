# ELAINA CLOUD

A Next.js + TypeScript domain request dashboard. Users submit a subdomain label and IPv4 target; an admin must approve before the app creates a real Cloudflare DNS A record.

## Features included

- Email/password signup and login via Supabase Auth
- Responsive dashboard, mobile hamburger navigation, light/dark theme
- Profile display name settings
- Domain request list and statuses
- Server-side limit of 3 pending/active domain slots per user
- Admin review queue: approve or reject with a note
- Real Cloudflare DNS record creation after approval
- Admin DNS deletion with Cloudflare record cleanup
- Admin-editable hero banner (text + public image URL)
- Admin global announcements with notification popover and dismissible first-open popup
- Per-user announcement feed cache in IndexedDB; shared announcement/banner source of truth in Supabase
- Demo ad-gate before domain submission (not monetized until an approved ad provider is integrated)
- Placeholder ad placement (not an ad network integration)
- Help center, stats cards, 16:9 dashboard hero, favicon and metadata
- Supabase schema and RLS policies

## Requirements

- Node.js 20+
- Supabase project
- Domain `elaina-cloud.my.id` already on Cloudflare
- Cloudflare API token scoped to the required zone and DNS edit permissions

## 1. Install and configure

```bash
npm install
cp .env.example .env.local
```

Fill these values in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server secret; never expose)
- `CLOUDFLARE_API_TOKEN` (server secret; never expose)
- `CLOUDFLARE_ZONE_ID`
- `DOMAIN_SUFFIX=elaina-cloud.my.id`

Do not prefix secret keys with `NEXT_PUBLIC_`. Do not commit `.env.local` to GitHub.

## 2. Set up Supabase

1. Open Supabase Dashboard → SQL Editor.
2. Run the latest `supabase/schema.sql` (includes `announcements` and `site_settings` for banner and global notifications). If you already ran an older version, run the whole updated file again; it uses `if not exists` and replaceable policies/functions.
3. Open Authentication → URL Configuration and set your local URL (`http://localhost:3000`) and later your production Vercel URL.
4. For a simpler initial test, you may disable email confirmation in Supabase Auth settings. For production, keep email confirmation enabled and configure SMTP.
5. Sign up with your own account.
6. In SQL Editor, promote only your own account to admin:

```sql
update public.profiles
set role = 'admin'
where email = 'YOUR_EXACT_EMAIL';
```

Never add an admin role field to the public signup form. Do not give the service-role key to users.

## 3. Configure Cloudflare

Create an API token with Zone → DNS → Edit permission, scoped only to the `elaina-cloud.my.id` zone. Copy the Zone ID from the Cloudflare dashboard. Put both in server environment variables.

The app creates A records as DNS-only (`proxied: false`). A DNS record maps a hostname to an IP; it does not host a website or make a server reachable by itself. Ensure the target is a public IP and the relevant service/ports are configured on your server.

## 4. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## 5. Deploy to Vercel

1. Push the project to a private GitHub repository.
2. In Vercel, import the repository.
3. Add all `.env.example` values under Project → Settings → Environment Variables. Use production values.
4. Deploy.
5. Add the Vercel production URL to Supabase Auth URL Configuration and allowed redirect URLs.
6. Test signup/login, user request, admin approval, DNS creation, and DNS deletion.

Official documentation:
- Next.js deployment: https://nextjs.org/docs/app/building-your-application/deploying
- Supabase Auth: https://supabase.com/docs/guides/auth
- Cloudflare DNS API: https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/
- Vercel environment variables: https://vercel.com/docs/environment-variables

## Security notes before production

- The service-role key bypasses RLS and must remain server-side.
- Admin role is read from the protected `profiles` table.
- Requests are reviewed server-side; the browser cannot directly create Cloudflare records.
- Add rate limiting / CAPTCHA before opening public signup widely.
- Consider a verified email requirement and audit log before production.
- The ad interstitial is only a demo gate/countdown, not a real paid ad view and does not generate revenue. To monetize, integrate an approved ad network/provider and follow its rules; never fake impressions or clicks. The banner editor supports direct image upload to the public `site-assets` Supabase Storage bucket (maximum 5 MB) or a public HTTPS image URL. Announcement content is shared in Supabase; a per-user IndexedDB cache is local to that browser/profile and is not a cross-device backup.
- Domain names are reserved across pending/active requests by a unique database index.
- This is a starter implementation: run the build and test the whole approval flow with a test zone before using a production DNS zone.


## API Hub (added in this source update)

- Admin API registry endpoints: `GET/POST /api/admin/apis`, `PATCH /api/admin/apis`, `DELETE /api/admin/apis?id=...`.
- Public metadata list: `GET /api/tools`.
- Generic endpoints route through `/api/v1/<category>/<slug>` to an HTTPS target configured in the registry.
- Add exact target hostnames to `API_PROXY_ALLOWED_HOSTS` in Vercel environment variables. The allowlist is mandatory to reduce SSRF risk.
- Supported methods: GET, POST, PUT, DELETE. The proxy only accepts JSON responses and has a 15-second timeout.
- This registry is an API configuration/backend foundation. It does not add a complete admin visual editor to the existing dashboard yet, and game logic/native handlers still need to be implemented as code.

## Flexible DNS request schema (foundation)

`domain_requests` now includes `dns_type`, `dns_name`, `dns_value`, `dns_ttl`, `dns_proxied`, `target_provider`, and `provider_notes`. The current domain request form and Cloudflare approval route still use the original A-record flow; extend the UI and provider adapters before claiming CNAME/TXT/MX/SRV or Vercel/Railway provider-specific automation is active. DNS alone does not provision a hosting project or attach a custom domain to Vercel/Railway; those integrations need their own provider credentials and API workflows.
