# Publik bokningssida — design

Status: godkänd av Paulina 2026-09-09
Del av: större initiativ (se [2026-09-09-crm-dashboard-design.md](2026-09-09-crm-dashboard-design.md)) — detta är projekt 2 av 2, bygger på samma databas som CRM:et.

## Bakgrund

Idag hanteras kursanmälningar manuellt: statiska Stripe-betallänkar skapas per kurstillfälle, och intresseanmälningar samlas in via ett fristående Google-formulär. Målet är en publik sida där besökare antingen bokar och betalar ett specifikt kurstillfälle direkt, eller lämnar en intresseanmälan om de inte är redo — båda flödena skriver direkt till samma databas som CRM:et (`crm-dashboard`) redan använder.

## Målgrupper

- **Redo att boka:** vet vilket datum de vill gå, ska kunna betala med Stripe direkt på sidan.
- **Inte redo:** intresserade men obestämda, eller inget datum passar — ska kunna lämna sina uppgifter utan att behöva bestämma sig.

## Arkitektur

- **Hosting:** Ny Next.js-app på Vercel, publicerad på subdomänen `kurser.pauspling.com`. Huvudsajten (pauspling.com) ligger kvar på Loopia oförändrad — beslutet att inte flytta huvuddomänen till Vercel togs medvetet (se Öppna punkter för DNS-steget).
- **Databas:** Samma Supabase-databas som `crm-dashboard` (`course_dates`, `participants`, `leads`) — ingen ny databas, inga dubbletter. Denna app och CRM-appen är två separata Vercel-projekt/repos som delar en databas, kopplade via samma `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`.
- **Repo:** Nytt privat GitHub-repo (samma motivering som `crm-dashboard`: hanterar betalningsflöden, hör inte hemma i det publika kursmaterial-repot).
- **Stripe-integration:** Servern skapar en Stripe Checkout Session dynamiskt per bokningsklick (inte en statisk betallänk), med `metadata.course_date_id` satt till kurstillfällets id. Rabattkoder (PRENUMERANT m.fl.) hanteras av Stripe Checkouts inbyggda "Lägg till kampanjkod"-fält — ingen egen rabattlogik.
- **Koppling till befintlig webhook:** `crm-dashboard`s webhook-hanterare (`handleCheckoutCompleted`) sätter idag INTE `course_date_id` på den skapade deltagaren — det fanns ingen bokningssida att koppla mot när den skrevs. Den här specen inkluderar att uppdatera webhook-hanteraren till att läsa `course_date_id` från `session.metadata` och spara den, så en bokning från den här sidan automatiskt hamnar på rätt kurstillfälle i CRM:et.

## Sidan

En (1) sida, staplad i två sektioner (inte flikar — beslutat efter jämförelse):

### 1. Boka nu
Lista över kommande `course_dates` (samma tabell CRM:et visar), varje rad visar:
- Datum + spår (svenska/engelska)
- Platser kvar (`capacity` minus antal `participants` för det datumet)
- Pris: **"3000 kr ex moms"** (fast text, ingen dynamisk prislogik i v1)
- Knapp "Boka" → POST till en server action som skapar en Stripe Checkout Session och redirectar dit
- Om platser kvar = 0: raden visas nedtonad, knappen ersätts med "Fullbokat" (inte klickbar)

### 2. Anmäl intresse
Formulär, samma fält som dagens Google-formulär (för att kunna ersätta det helt):
- Namn, E-post (obligatoriska)
- Datumpreferens — kryssrutor (flerval): "Allmänt intresserad när det kommer nya datum", "Jag kan bara/föredrar kvällstid", "Jag kan bara/föredrar på helgen", "Jag vill inte köra digitalt"
- Fritextfråga: "Har du några särskilda frågor eller önskemål?"
- Skickar direkt till `leads`-tabellen (`source: 'formulär'`). Kryssrutorna och fritextsvaret sparas i `leads.note` som formaterad text i v1 (ingen egen kolumn per kryssruta — matchar hur CRM:ets `leads`-tabell redan är byggd).

## Stil

Samma editoriella designsystem som redan finns i `crm-dashboard/app/globals.css` (CSS-variabler för ljust/mörkt tema, kort/tile-komponenter, samma typografi) — inte den äldre kurssajtens persika/plommon-palett. Motivering: konsekvens mellan de två apparna som nu delar databas, och det är den stil Paulina uttryckligen bad om.

## Kantfall

- **Race condition på sista platsen:** två personer kan i teorin boka samtidigt när bara 1 plats är kvar. v1 löser inte detta med databaslåsning — Stripe-webhooken skapar ändå deltagaren, så värsta fallet är en enstaka överbokning som Paulina får hantera manuellt (samma risk som redan finns med statiska betallänkar idag).
- **Namn/e-post-dubbletter:** samma matchningslogik (`lib/matching.ts`-mönstret från CRM:et) återanvänds inte automatiskt här eftersom nya bokningar går via samma webhook-hanterare som redan har den logiken.

## Öppna punkter (löses under implementation)

- Delning av `lib/`-kod (t.ex. Supabase-klient) mellan de två separata reposen — v1 duplicerar den lilla mängd kod som behövs snarare än att sätta upp ett delat paket, för att hålla båda apparna enkla att resonera om var för sig.

## Redan klart

- Subdomänen `kurser.pauspling.com` är redan skapad hos Loopia (samma steg som `crm.pauspling.com` tidigare) — DNS-posten (CNAME mot Vercel) läggs till när Vercel-projektet skapas, som för CRM:et.
