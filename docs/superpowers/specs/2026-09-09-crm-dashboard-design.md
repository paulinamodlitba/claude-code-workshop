# CRM/lead-dashboard för kursanmälningar — design

Status: godkänd av Paulina 2026-09-09
Del av: större initiativ (se "Relaterat" nedan) — detta är projekt 1 av 2, fristående byggbart.

## Bakgrund

Idag hanteras kursleads och deltagare manuellt: `deltagare_<datum>.csv`-filer per kurstillfälle, en separat `intresseanmalda_ej_betalt.csv` för väntelistan, och manuell avstämning mot Stripe (via MCP) och Zoom-inbjudningar. Det är tidskrävande och saker faller mellan stolarna (t.ex. påbörjade men aldrig fullföljda Stripe-betalningar som bara syns om man aktivt frågar Stripe).

Målet är ett samlat internt verktyg som ersätter CSV-filerna och den manuella avstämningen.

## Datakällor

- **Stripe** (kontot Pauspling, livemode) — enda källan till betalningar och "nästan-betalare" (påbörjade men utgångna/övergivna checkout-sessioner).
- **Google-formulär** — befintlig huvudkälla för intresseanmälningar/väntelista (motsvarar dagens `intresseanmalda_ej_betalt.csv`). Verkliga fält (bekräftade 2026-09-09 mot det publicerade svarsarket): Tidstämpel, E-postadress, För- och efternamn, "Vilka datum/tider kan eller föredrar du?" (flerval), "Är du betalande prenumerant av mitt nyhetsbrev?" (Ja/Nej/Vet ej), fritextfråga om önskemål. Produktionssynk kräver en Google-tjänstekontonyckel — se Öppna punkter.
- **Manuell inmatning** — för leads som kommer in via mejl/Slack/LinkedIn utanför formuläret.

## Arkitektur

- **Hosting:** Next.js-app på Vercel, publicerad på en subdomän under pauspling.com (t.ex. `crm.pauspling.com`). DNS pekas om hos Loopia mot Vercel.
- **Åtkomstskydd:** En delad lösenordsgrind (inte individuella konton) framför hela appen.
- **Databas:** Supabase (Postgres).
- **Stripe-integration:** En webhook-endpoint i appen.
  - `checkout.session.completed` → skapar/uppdaterar en rad i `participants`.
  - `checkout.session.expired` → loggar en rad i `leads` med källa "nästan-betalare".
- **Återanvändning:** Samma Vercel-projekt och Supabase-databas är tänkt att återanvändas av den publika bokningssidan (separat projekt, se "Relaterat") — bokningssidan skapar Stripe-checkout-sessioner mot samma `course_dates`-tabell istället för att duplicera data.

## Datamodell (grovt)

- **`course_dates`** — kurstillfällen: datum, spår (svenska / Menti-engelska), kapacitet.
- **`participants`** — bekräftade betalande: namn, e-post, belopp, rabattkod (om någon), koppling till `course_date`, koppling till Stripe-betalning, checkbox "Zoom-inbjudan skickad".
- **`leads`** — allt som inte betalat: namn, e-post, källa (formulär / manuellt / nästan-betalare), status ("ny" / "kontaktad"), valfri koppling till ett kommande `course_date` (för att signalera "vill gå den här kursen"), samt två fält specifika för formulärsvar: `is_subscriber` (nyhetsbrevsprenumerant, påverkar pris) och `note` (fritextönskemål/datumpreferens som text tills vidare).

## Vyer och funktioner

1. **Startsida — kurstillfällen:** lista över kommande `course_dates` med antal betalande/kapacitet, antal på väntelista, och en varningsflagga om någon betalande saknar bockad Zoom-inbjudan.
2. **Kurstillfälle-detalj:** deltagarlista (namn, e-post, betalt-status, notering) + väntelista kopplad till datumet + ev. nästan-betalare kopplade dit.
3. **Leads-vy:** alla leads oavsett datum, filtrerbart på källa. Markera "kontaktad", koppla till ett kommande datum.
4. **Statistik:** betalande per tillfälle över tid, konverteringsgrad lead → betalande. Ett enkelt diagram.

## Kantfall

- **Namn/e-post-mismatch** (kända problemet: folk betalar från annan mejl än de anmälde sig med) — matchning på både namn OCH e-post vid import/synk, med en "möjlig dubblett"-flagga för manuell koll. Ingen automatisk sammanslagning.
- **Rabattkoder** (t.ex. PRENUMERANT, "gå om"-rabatt) — lagras som fält på `participants`, ingen separat prislogik i v1.
- **Utländska betalare utan svensk moms** — samma tabell och flöde, bara annat belopp.

## Testning

- Stripes egna test-events (CLI eller dashboard) mot webhook-endpointen innan livemode kopplas på.
- Manuell klick-igenom av samtliga vyer innan lansering.
- Inget automatiskt testsvit i v1 — intern verktygsskala motiverar inte det.

## Öppna punkter (löses under implementation, inte i denna spec)

- Åtkomst till Google-formulärets svarsark (delning/API-koppling) är inte ordnad.
- Exakt DNS-ändring hos Loopia för subdomänen görs i samband med Vercel-uppsättning.
- Migrering av befintliga CSV-filer (deltagare_*.csv, intresseanmalda_ej_betalt.csv) till Supabase — engångsimport, hanteras som en implementationsuppgift.

## Relaterat

- **Projekt 2 (separat spec, ej påbörjad):** Publik bokningssida under pauspling.com/kurser där besökare väljer datum och betalar via Stripe. Delar backend/databas med detta projekt men brainstormas och specas separat.
