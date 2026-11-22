# Ryms

Mobilanpassad budgetapp för Sverige. Kärnan är frågan **”Ryms det?”**: fota en vara (eller skriv in den) och få svar i kronor mot din budget, dina räkningar före lön, planerade köp och ditt sparande. Ryms förklarar – du bestämmer.

Stack: Next.js 16 (App Router, TypeScript), SQLite via `better-sqlite3`, egen inloggning (scrypt + sessionskaka), Anthropic SDK för bildanalys, Enable Banking för kontoinformation.

## Vad som finns här

- **Appen** (endast mobil): startsida, månadsplan, ”Ryms det?”, sparat, köp och inställningar. På en bredare skärm visas den som en telefonbred kolumn.
- **Landningssidan** på `/` är hemsidan: den visas för den som besöker adressen utan att vara inloggad, på dator och mobil. Själva appen öppnar på välkomstskärmen `/valkommen`.
- **Svenska och engelska**; språk och visningsvaluta väljs på välkomstskärmen respektive under Inställningar.
- **Körbar förhandsvisning** i en enda HTML-fil, utan server: `node preview/build.mjs` skriver `preview/dist/index.html`. Allt ligger i minnet och försvinner vid omladdning.

## Kom igång

```bash
npm install
```

```bash
npm run dev
```

Öppna http://localhost:3000 – helst i mobilvy (iPhone) eller på telefonen via datorns IP-adress.

Produktionsläge:

```bash
npm run build
```

```bash
npm start
```

Databasen och sparade bilder hamnar i `./data` (ändras med `RYMS_DATA_DIR`). Inställningar: kopiera `.env.example` till `.env.local`. Inget i den filen krävs för demon.

## Demon

Tryck **Prova demon** på startsidan. Ingen inloggning, ingen bank. Du får fyra påhittade budgetar för samma person och byter mellan dem i den lila remsan högst upp:

| Budget | Vad den visar | Jacka för 699 kr |
|---|---|---|
| Gott om utrymme | 900 kr kvar till kläder | Ja – 201 kr kvar |
| Mindre klädbudget | 400 kr kvar (bara november är ändrad) | Det fattas 299 kr; flytt från annan kategori föreslås |
| Kängorna är planerade | 1 500 kr, varav 1 200 reserverat | Tar 399 kr av reservationen |
| Tajt före lön | Ryms i kategorin, men elräkning före lön | 180 kr saknas till elräkningen |

Gå till **Ryms det?** och välj exempelbilden på jackan. Svarsskärmen visar också samma köp mot de tre andra budgetarna, med en länk för att byta. Exempelbilderna har förbestämda svar och skickas inte till någon AI-tjänst. Under *Bank och integritet* finns **Hämta från demobanken**, som låter ett köp du registrerat dyka upp som banktransaktion så att avstämningen syns.

Demodata ligger i en egen miljö (`demo`) och blandas aldrig med sandbox- eller skarp bankdata. Demon visar ”Demobank”, aldrig ”Bank ansluten”.

## Tester

```bash
npm test
```

41 enhetstester: beräkningsmotorn (öre, reservationer, räkningar i datumordning), månadsplanen, bankimport och avstämning, behörighet mellan användare, kryptering, leverantörens dataformat.

```bash
npm run build && npm run test:e2e
```

30 steg i Chromium i iPhone 14-storlek mot en riktig server och tom databas, plus en kontroll i datorbredd. Skärmbilder sparas i `tests/e2e/shots/`. Acceptansfallen 1–6 finns både som enhetstester och i den här genomgången.

## Hur siffrorna räknas

- All räkning sker i `src/lib/engine/` med heltal i öre. Inga flyttal, ingen AI.
- **Kvar i kategori** = budget − köp (minus återbetalningar). **Kvar till annat** = det minus reservationer för planerade köp.
- **Kvar till lön** = saldo − obetalda räkningar före lönedagen + bekräftade insättningar − planerat sparande som inte är insatt. Räkningar prövas i datumordning, så svaret kan peka ut vilken räkning som inte går ihop.
- Planerat sparande (plan) och faktiskt sparande (insättningar) är skilda saker. ”Avstå” flyttar inga pengar.
- Månadsplanen är en mall med startmånad plus ändringar för enskilda månader. En ändring ”bara november” rör varken oktober eller december.
- Ett köp du registrerat och samma köp från banken slås ihop (exakt belopp, datum inom −1…+5 dagar). Är det tvetydigt frågar Ryms och håller banktransaktionen utanför summan tills du svarat. Upprepad import ändrar ingenting.

## Bildanalys

Sätt `ANTHROPIC_API_KEY` för att slå på foto och skärmbild. Utan nyckel är knapparna avstängda och allt annat fungerar med egen inmatning.

- Bilden krymps i webbläsaren, skickas till `/api/analyze`, hålls i minnet och skickas vidare till Claude. Den skrivs aldrig till disk där.
- Det enda som följer med är namnen på budgetkategorierna. Inga saldon, transaktioner eller bankuppgifter.
- Användaren godkänner detta före första uppladdningen och kan ta tillbaka det.
- Filtyp avgörs av innehållet (JPEG/PNG/WebP), max 8 MB. Bilden sparas bara om användaren kryssar i ”Spara bilden också”, då utanför webbroten och bara läsbar för ägaren.
- Saknas pris, syns flera priser eller är valutan oklar ställs en kort fråga. Priset hittas aldrig på och räknas aldrig om från annan valuta.

**Inte testat här:** själva anropet till Claude. Miljön saknade API-nyckel, så testerna täcker tolkningen av svaret, frågelogiken, filvalidering och godkännandet – inte ett riktigt bildsvar.

## Aktivera riktig bankkoppling

Bankkopplingen är valfri och avstängd tills den konfigurerats. Vald leverantör: **Enable Banking** (kontoinformation, AIS).

**Viktigt om underlaget.** Leverantörens dokumentationssidor gick inte att öppna från byggmiljön (nätverksspärr). Integrationen bygger på leverantörens officiella exempelkod (`github.com/enablebanking/enablebanking-api-samples`) och på sökmotorsutdrag ur dokumentationen. Kontrollera därför följande mot https://enablebanking.com/docs/api/reference/ innan något går live:

- fältnamn i `/sessions`, `/balances` och `/transactions` (särskilt `account_id`, `creditor`/`debtor`, felkroppens format)
- att sandbox-appar använder samma värd som produktion (`api.enablebanking.com`)
- vilka svenska banker som stöds för privatkonton: `GET /aspsps?country=SE&psu_type=personal` är facit. Sökutdragen nämnde Swedbank och sparbankerna, SEB, Handelsbanken, Nordea, Länsförsäkringar och Danske Bank; ICA Banken, SBAB och Skandia är obekräftade.
- om Ryms får betjäna andra användare under leverantörens tillstånd utan eget AISP-tillstånd. Det gick inte att bekräfta och måste redas ut med leverantören.

Steg:

1. Registrera en applikation i Enable Bankings kontrollpanel. Sandbox aktiveras enligt uppgift direkt och är kostnadsfri.
2. Ange `<APP_URL>/api/bank/callback` som tillåten återhoppsadress.
3. Sätt `ENABLEBANKING_APP_ID`, `ENABLEBANKING_PRIVATE_KEY_PATH` (eller `ENABLEBANKING_PRIVATE_KEY`), `APP_URL` och `RYMS_ENCRYPTION_KEY`.
4. Låt `BANK_ENV` vara `sandbox`. Då märks anslutningen ”Sandbox ansluten – testdata”.
5. För skarp drift: produktionsapplikation hos leverantören (avtal och företagskontroll; utan avtal är den enligt uppgift begränsad till egna länkade konton), HTTPS, integritetspolicy och villkor, och `BANK_ENV=production`. Först då kan ”Bank ansluten” visas.

Gränser som koden håller:

- Bara `GET /aspsps`, `POST /auth`, `POST /sessions`, saldon, transaktioner och `DELETE /sessions/{id}` anropas. `POST /auth` begär enbart `access: { balances, transactions }`. Betalningsändpunkterna används inte och providergränssnittet saknar metoder för dem.
- Inloggning och BankID sker hos banken. Ryms har inga fält för bankuppgifter.
- Sessionsnyckeln lagras krypterad (AES-256-GCM), bara på servern, och loggas aldrig.
- Användaren väljer konton; ovalda konton hämtas inte.
- Koppla från anropar `DELETE /sessions/{id}`, raderar nyckeln och stoppar hämtningar. Radera importerad data och radera konto är egna val.
- Hanterat: avbruten inloggning, okänt `state`, utgånget samtycke, bank som inte svarar (äldre data ligger kvar och märks som försenad), hämtningsgräns.

**Inte testat här:** anrop mot Enable Banking. Flödet är testat mot en låtsasleverantör med samma gränssnitt.

## Kända begränsningar

- Ingen schemalagd bankhämtning; hämtning sker när användaren trycker ”Hämta nu”.
- Ett manuellt köp som registrerats före en bankhämtning men ännu inte dykt upp hos banken räknas i budgeten men dras inte från saldot.
- Ingen e-postverifiering eller lösenordsåterställning.
- SQLite på lokal disk: en serverinstans.

## Bilder och typsnitt

- Bakgrundsbilderna i `public/bg/` kommer från uppladdade referensbilder. Kontrollera rättigheterna innan appen publiceras.
- Rubriker sätts i Castoro, det fria typsnitt som ligger närmast logotypen; logotypens exakta typsnitt är inte känt.
