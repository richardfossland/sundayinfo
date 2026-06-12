# SundayInfo

Infoskjermen for menigheten — del av [Sunday Suite](https://sundaysuite.app).

**Det som gjør den genial i forhold til vanlige infoskjermer:**

- **Aldri utdatert** — alt innhold har utløpsdato og forsvinner av seg selv
- **Vet hvor i uka den er** — nedtelling før gudstjenesten, program underveis,
  «takk for i dag» etterpå, ukesprogram resten av uka
- **Kirkeåret innebygd** — liturgisk farge som tema, helt offline
- **Hastemelding fra mobilen** — overlay på alle skjermer på sekunder
- **Soner** — foajé, kafé og barnerom med hvert sitt innhold, ett adminpanel
- **Lim inn tekst → pen slide** — tittel, QR-kode og bibelvers gjenkjennes
- **Tåler nettbrudd** — skjermen ruller videre fra lokal cache og kobler seg på igjen
- **Null oppsett på TV-en** — åpne én URL, tast koden inn på mobilen, ferdig

## Kom i gang (utvikling)

```bash
cp .env.example .env.local   # fyll inn Supabase-nøkler (SundayPlan-prosjektet)
npm install
npm run dev                  # http://localhost:3000 (admin) + /skjerm (display)
npm run check                # tsc + eslint + vitest
npm run test:db              # DB-logikk mot ekte Postgres (krever Docker)
```

Skjermen: åpne `/skjerm` på hva som helst med nettleser (smart-TV, Chromecast,
Raspberry Pi i kiosk-modus med `/skjerm?t=<token>`).
