# SMD - Dokumentim i punes se realizuar deri tani

## 1. Pershkrim i pergjithshem

SMD, ose Sistemi i Menaxhimit te Depove, eshte nje aplikacion per menaxhimin e punes operative ne depo. Qellimi kryesor i sistemit eshte te ndihmoje ne kontrollin e stokut, dokumenteve hyrese dhe dalese, levizjeve te artikujve, produkteve, partnereve, pagesave, auditimit dhe raporteve.

Projekti nuk eshte me vetem nje skelet teknik. Deri tani jane ndertuar module funksionale ne backend, databaze dhe frontend, me logjike reale biznesi per punen e perditshme te depos.

## 2. Arkitektura e projektit

Projekti eshte ndare ne disa shtresa kryesore:

- `SMD.API` - shtresa e API-se, ku ekspozohen endpoint-et per frontend dhe klientet e tjere.
- `SMD.Application` - shtresa e kontratave, DTO-ve, komandave, query-ve dhe interface-ve te sherbimeve.
- `SMD.Domain` - shtresa e entiteteve kryesore te biznesit dhe enum-eve.
- `SMD.Infrastructure` - shtresa e databazes, Entity Framework Core, migrimeve dhe implementimeve te sherbimeve.
- `smd-ui` - frontend i ndertuar me React, TypeScript dhe Vite.
- `SMD.ConcurrencyTest` - projekt ndihmes per testim/eksperimentim me skenare concurrency.
- `docs` - dokumentim i projektit.

Kjo ndarje e ben sistemin me te organizuar dhe me te lehte per mirembajtje, sepse logjika e biznesit, API-ja, databaza dhe UI-ja nuk jane te perziera ne nje vend te vetem.

## 3. Teknologjite e perdorura

Ne backend jane perdorur:

- .NET
- ASP.NET Core Web API
- Entity Framework Core
- SQL Server
- JWT Authentication
- Authorization Policies
- Swagger / OpenAPI
- ClosedXML per export Excel
- QuestPDF per export PDF

Ne frontend jane perdorur:

- React
- TypeScript
- Vite
- React Router
- Axios
- CSS i personalizuar per UI

## 4. Autentikimi dhe autorizimi

Eshte ndertuar mekanizmi per autentikim me JWT token. Perdoruesi mund te kyqet ne sistem dhe token-i ruhet ne frontend per thirrjet e metejshme drejt API-se.

Jane ndertuar rolet kryesore:

- Admin
- Punetor / Worker
- Mbikeqyres / Supervisor
- Menaxher / Manager

Jane konfiguruar politika autorizimi per veprime te ndryshme:

- konfirmim dokumentesh,
- editim te master data,
- levizje direkte te stokut,
- eksportim raportesh,
- shikim te audit logs,
- editim dokumentesh,
- menaxhim perdoruesish.

Kjo do te thote qe sistemi nuk i trajton te gjithe perdoruesit njesoj, por kufizon veprimet sipas rolit te tyre.

## 5. Entitetet kryesore te domenit

Ne shtresen `SMD.Domain` jane krijuar entitetet kryesore:

- `User`
- `Warehouse`
- `Zone`
- `Rack`
- `Bin`
- `Product`
- `Customer`
- `Supplier`
- `Inventory`
- `StockMovement`
- `InboundDocument`
- `InboundDocumentLine`
- `OutboundDocument`
- `OutboundDocumentLine`
- `PartnerPayment`
- `AuditLog`

Gjithashtu jane krijuar enum-et:

- `DocumentStatus`
- `DocumentType`
- `OutboundPriceTier`
- `StockMovementType`
- `UserRole`

Keto modele jane baza e sistemit dhe perfaqesojne strukturen reale te depos, dokumenteve, stokut, perdoruesve dhe financave.

## 6. Struktura e depos

Eshte ndertuar moduli per strukturen fizike te depos:

- depo,
- zona,
- rafte,
- bina / lokacione.

Sistemi lejon qe nje depo te kete zona, zona te kete rafte, dhe raftet te kene bina. Kjo e ben te mundur gjurmimin e sakte te vendndodhjes se stokut.

Jane shtuar edhe endpoint-e lookup dhe suggested per te ndihmuar UI-ne qe perdoruesi te zgjedhe me shpejt lokacionet.

## 7. Produktet

Eshte ndertuar moduli i produkteve me funksione CRUD:

- krijim produkti,
- listim produktesh,
- shikim detajesh,
- perditesim produkti,
- fshirje produkti.

Per produktet jane perfshire:

- SKU unik,
- emer produkti,
- barcode,
- njesi matese,
- minimum stock level,
- cmim blerjeje,
- cmim retail,
- cmim wholesale,
- cmim VIP.

Jane ndertuar gjithashtu:

- gjenerim i barcode-it te ardhshem,
- export/printim i barcode labels ne PDF.

## 8. Inventari

Eshte ndertuar moduli i inventarit per te pare dhe menaxhuar gjendjen aktuale te stokut.

Funksionalitetet kryesore jane:

- listim i inventarit,
- inventar sipas bin-it,
- inventar sipas produktit,
- permbledhje e inventarit,
- raport i skadencave,
- charts/statistika per inventarin,
- rregullim i sasise se inventarit,
- rezervim stoku,
- heqje rezervimi.

Inventari mbeshtet edhe:

- lot number,
- batch number,
- expiry date.

Kjo eshte e rendesishme per produkte qe kane seri, lote ose data skadence.

## 9. Levizjet e stokut

Eshte ndertuar moduli per levizjet e stokut.

Sistemi mbeshtet:

- hyrje direkte ne stok,
- dalje direkte nga stoku,
- transferim ndermjet lokacioneve,
- adjust/rregullim sasie,
- listim dhe gjurmim te levizjeve.

Cdo levizje lidhet me produktin, sasine, tipin e levizjes dhe lokacionet perkatese. Kjo ndihmon ne historikun dhe auditimin e ndryshimeve te stokut.

## 10. Dokumentet hyrese

Eshte ndertuar moduli per dokumentet hyrese, qe perdoren kur mallrat hyjne ne depo.

Funksionalitetet kryesore:

- krijim i draft dokumentit hyres,
- shtim linjash ne dokument,
- ulje sasie ne linje,
- fshirje linje,
- konfirmim dokumenti,
- anulim dokumenti,
- shikim detajesh,
- listim dokumentesh,
- permbledhje dokumentesh.

Dokumenti hyres lidhet me furnizuesin. Kur dokumenti konfirmohet, sasia shtohet ne inventar.

Linjat hyrese mbeshtesin:

- produkt,
- sasi,
- bin destinacion,
- lot number,
- batch number,
- expiry date.

## 11. Dokumentet dalese

Eshte ndertuar moduli per dokumentet dalese, qe perdoren kur mallrat dalin nga depoja.

Funksionalitetet kryesore:

- krijim i draft dokumentit dales,
- shtim linjash,
- ndryshim sasie ne linje,
- fshirje linje,
- konfirmim dokumenti,
- anulim dokumenti,
- shikim detajesh,
- listim dokumentesh,
- permbledhje dokumentesh.

Dokumenti dales lidhet me klientin. Kur dokumenti konfirmohet, sasia zbritet nga inventari.

Jane shtuar price tiers per dokumente dalese:

- retail,
- wholesale,
- VIP.

Jane mbeshtetur edhe lot, batch dhe expiry ne linjat dalese, duke mundesuar logjike FEFO per daljen e stokut.

## 12. Numrat e dokumenteve

Eshte ndertuar sherbimi per gjenerimin e numrave te dokumenteve.

Sistemi ka mekanizem per:

- numerim te dokumenteve hyrese,
- numerim te dokumenteve dalese,
- unique document number,
- tabela/migrime per document sequences.

Kjo ndihmon qe dokumentet te jene te gjurmueshme dhe te mos krijohen numra te dubluar.

## 13. Klientet dhe furnizuesit

Jane ndertuar modulet per klientet dhe furnizuesit.

Per klientet:

- listim,
- lookup,
- shikim detajesh,
- krijim,
- perditesim.

Per furnizuesit:

- listim,
- lookup,
- shikim detajesh,
- krijim,
- perditesim.

Te dy modulet mbeshtesin fusha si:

- kod,
- emer,
- person kontakti,
- telefon,
- email,
- adrese,
- shenime,
- status aktiv.

## 14. Pagesat dhe borxhet

Eshte ndertuar moduli i financave per partnere.

Funksionalitetet kryesore:

- balanca per klientet dhe furnizuesit,
- listim pagesash,
- regjistrim pagesash,
- lidhje e pagesave me dokumente hyrese/dalese,
- listim dokumentesh te papaguara,
- export per dokumente te papaguara.

Export-et mbeshtesin:

- CSV,
- Excel,
- PDF.

Ky modul ndihmon qe sistemi te mos mbetet vetem inventar, por te lidhe edhe levizjet e mallrave me obligimet financiare.

## 15. Auditimi

Eshte ndertuar moduli i auditimit.

Audit logs ruajne:

- veprimin,
- entitetin,
- ID e entitetit,
- detajet,
- perdoruesin,
- IP address,
- daten e krijimit.

Ne backend ekziston `AuditLogService`, ndersa ne frontend ka faqe te dedikuar per regjistrin e auditimit. Shikimi i audit logs eshte i kufizuar per rolet e autorizuara.

## 16. Dashboard

Eshte ndertuar dashboard-i kryesor i sistemit.

Backend-i ofron `DashboardService` dhe endpoint per summary, ndersa frontend-i ka faqen `DashboardPage`.

Dashboard-i sherben si hyrje kryesore ne sistem dhe jep pamje te pergjithshme per gjendjen dhe aktivitetin.

## 17. Eksportet dhe raportet

Jane ndertuar disa eksportime:

- dokument hyres ne PDF,
- dokument dales ne PDF,
- dokument hyres ne Excel,
- dokument dales ne Excel,
- inventar ne Excel,
- inventory report ne CSV,
- stock movements report ne CSV,
- unpaid documents ne CSV/Excel/PDF.

Ne backend eshte krijuar `ExportService`, ndersa ne frontend ka helper per shkarkime.

## 18. Frontend

Frontend-i eshte ndertuar si aplikacion React me navigim te brendshem.

Faqet kryesore te ndertuara:

- Login
- Paneli kryesor
- Dokument i ri
- Pranimet
- Detajet e pranimit
- Daljet
- Detajet e daljes
- Inventari
- Levizjet e stokut
- Produktet
- Klientet
- Furnizuesit
- Pagesat dhe borxhet
- Regjistri i auditimit

Jane ndertuar edhe:

- layout kryesor me sidebar,
- mbrojtje e route-ve me `RequireAuth`,
- mbrojtje sipas roleve me `RequireRole`,
- ruajtje e token-it,
- leximi i session user,
- dark/light theme,
- UI components te perbashket,
- helpers per permissions,
- helpers per dokumente,
- helpers per scanner/barcode input.

## 19. API controllers

Ne backend jane krijuar controller-at kryesore:

- `AuthController`
- `UsersAdminController`
- `WarehouseController`
- `ZoneController`
- `RackController`
- `BinsController`
- `BinsLookupController`
- `ProductsController`
- `InventoryController`
- `StockMovementController`
- `InboundDocumentController`
- `OutboundDocumentController`
- `CustomersController`
- `SuppliersController`
- `PartnerFinanceController`
- `AuditLogsController`
- `DashboardController`
- `DocumentExportController`
- `ReportExportController`
- `HealthController`
- `TestController`

Keta controller-a perbejne siperfaqen kryesore te komunikimit mes frontend-it dhe backend-it.

## 20. Databaza dhe migrimet

Eshte ndertuar databaza me Entity Framework Core dhe SQL Server.

Migrimet mbulojne:

- krijimin fillestar,
- perdoruesit dhe statusin aktiv,
- depot,
- zonat, raftet dhe bin-at,
- produktet,
- inventarin,
- levizjet e stokut,
- dokumentet hyrese/dalese,
- audit logs,
- row version per concurrency,
- document sequences,
- minimum stock level,
- klientet dhe furnizuesit,
- lidhjen e partnereve me dokumente,
- price tiers per produkte dhe dalje,
- pagesat dhe balancat,
- lidhjen e pagesave me dokumente,
- lot/batch/expiry per hyrje,
- lot/batch/expiry dhe FEFO per dalje.

## 21. Dokumentimi ekzistues

Ne dosjen `docs` ekziston edhe dokumenti:

- `SMD_Dokumentim_Master_Sistemet_e_Kontrollit_dhe_Inteligjenca_Artificiale.docx`

Ky dokumentim i ri sherben si permbledhje teknike dhe funksionale e punes se realizuar deri tani ne projekt.

## 22. Gjendja aktuale e sistemit

Sistemi aktualisht ka:

- backend funksional,
- frontend funksional,
- databaze me strukture te zgjeruar,
- autentikim dhe role,
- module kryesore te depos,
- inventar dhe levizje stoku,
- dokumente hyrese/dalese,
- barcode dhe labels,
- klient/furnizues,
- financa te partnereve,
- audit logs,
- dashboard,
- raporte dhe export-e.

Me pak fjale, SMD eshte kthyer ne nje sistem real per menaxhim depoje, jo vetem ne nje demo teknike.

## 23. Puna qe mund te vazhdoje me tej

Hapat e ardhshem te mundshem:

- pastrim i encoding ne disa tekste shqip ne UI/backend,
- testim me i gjere i rrjedhave kryesore,
- testim automatik per dokumente dhe inventar,
- perfundim i dokumentimit teknik per secilin endpoint,
- permiresim i UI per mobile/tablet,
- shtim i raporteve me te avancuara,
- menaxhim me i detajuar i permissions,
- auditim me i plote per te gjitha veprimet kritike,
- backup/restore workflow per databazen,
- paketim/deployment ne ambient prod.

