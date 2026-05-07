# SMD - Sistemi i Menaxhimit të Depove

**SMD** është një aplikacion për menaxhimin e depove, i ndërtuar për të ndihmuar bizneset në organizimin, monitorimin dhe kontrollin e stokut, produkteve, lokacioneve dhe lëvizjeve të mallrave brenda depos.

Sistemi është zhvilluar me arkitekturë stack-on-top-stack dhe është i ndarë në disa shtresa: **Domain**, **Application**, **Infrastructure**, **API** dhe **Frontend**.

## Qëllimi i projektit

Qëllimi kryesor i këtij projekti është të ofrojë një zgjidhje praktike dhe të strukturuar për menaxhimin e depove, duke përfshirë:

- Menaxhimin e produkteve
- Menaxhimin e depove, zonave, rafteve dhe shportave
- Regjistrimin e hyrjeve dhe daljeve të mallrave
- Gjurmimin e stokut aktual
- Lëvizjet e stokut
- Raporte dhe eksportime në PDF/Excel/CSV
- Auditim të aktiviteteve të përdoruesve
- Web app për përdoruesit

## Teknologjitë e përdorura

### Backend

- ASP.NET Core
- Entity Framework Core
- SQL Server
- JWT Authentication
- Swagger / OpenAPI
- QuestPDF
- ClosedXML

### Frontend

- React
- TypeScript
- CSS / UI Components
- REST API integration

## Struktura e projektit

```
SMD
├── SMD.API              # API layer / Controllers
├── SMD.Application      # Application services and business logic
├── SMD.Domain           # Domain entities and enums
├── SMD.Infrastructure   # Database, persistence and infrastructure services
├── smd-ui               # React frontend application
├── docs                 # Documentation
├── tools                # Helper tools/scripts
└── SMD.sln              # Visual Studio solution
