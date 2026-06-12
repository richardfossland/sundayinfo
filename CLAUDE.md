# SundayInfo

Digital signage («infoskjerm») for menigheter — `info.sundaysuite.app`.
Norsk UI, engelsk kode. Next.js 16 App Router + React 19 + TS, deployet via
OpenNext til Cloudflare Workers. Data i **SundayPlans Supabase-prosjekt**
(IKKE spill-prosjektet): tenancy gjenbrukes fra `public.church`/`public.church_member`,
appen eier `info`-schemaet.

## Kommandoer
- `npm run check` — tsc + eslint + vitest (full gate, må være grønn)
- `npm run test:db` — Docker-Postgres: migrasjon ×2 (idempotens) + logikk-assertions
- `npm run cf:build && npm run cf:deploy` — deploy til Cloudflare

## Arkitektur
- **Skjermen** (`/skjerm`): én URL for alle TV-er. Uten token → parings-UI
  (6-tegns kode); med token (localStorage, evt. `?t=` for kiosk) → display-loop.
  30 s heartbeat-poll er sannheten; realtime broadcast er kun hint om å polle nå.
  Siste snapshot caches i localStorage → overlever nettbrudd; publish/expiry og
  auto-modus (`lib/display/mode.ts`, ren funksjon) kjører på skjermens klokke.
- **Admin** (mobil-først, norske ruter): auth = Supabase magic link/Google via
  `@supabase/ssr`-cookie på `.sundaysuite.app` (Sunday Account SSO-mønsteret).
  Autorisasjon slås ALLTID opp server-side (`lib/server/auth.ts`) — aldri fra body.
- **API**: alle skriv via route handlers med service-role. RLS på alle
  `info`-tabeller uten policies (suite-konvensjonen). Device-tokens og
  poll-nøkler lagres kun som sha256-hash; klartekst-token leveres nøyaktig én
  gang via `pairing_poll`-RPC.
- **Kirkeåret** (`lib/churchyear/`): computus + norsk kalender + liturgiske
  farger, helt offline. Bibeltekst bundles IKKE (Bibel 2011 er opphavsrettslig
  beskyttet) — redaktør limer inn vers selv.

## Deploy-feller (lært av søsterappene)
1. `info`-schemaet MÅ eksponeres i Supabase Dashboard → Settings → API →
   Exposed schemas (kan ikke settes via SQL), og trenger eksplisitt
   `grant usage` + tabell-grants (ligger i migrasjonen).
2. Worker-secret: `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`.
   Build-env: `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` (Plan-prosjektet) +
   `NEXT_PUBLIC_COOKIE_DOMAIN=.sundaysuite.app`.
3. `app_grant`-constrainten i SundayPlan mangler `'info'` — egen
   Plan-migrasjon trengs først når SSO-grants skrus på (ikke blokkerende).
