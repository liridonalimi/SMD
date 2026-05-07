export const UI = {
    common: {
        back: "Prapa",
        confirm: "Konfirmo",
        cancel: "Anulo",
        add: "Shto",
        delete: "Fshi",
        details: "Detaje",
        exportPdf: "Eksporto PDF",
        exportExcel: "Eksporto ne Excel",
        loading: "Duke u ngarkuar...",
        notFound: "Dokumenti nuk u gjet.",
        noData: "Nuk ka te dhena per t'u shfaqur.",
        total: "Totali",
        page: "Faqja",
        prev: "Prapa",
        next: "Tjetra",
        yes: "Po",
        no: "Jo",
        error: "Ndodhi nje gabim.",
    },

    auth: {
        loginTitle: "Kycu",
        email: "Email",
        password: "Fjalekalimi",
        signIn: "Kycu",
        signingIn: "Duke u kycur...",
        sessionExpired: "Sesioni ka skaduar. Ju lutem kycuni perseri.",
    },

    document: {
        inboundTitle: "Pranime",
        outboundTitle: "Dalje",
        inboundDocumentTitle: "Dokument hyres",
        outboundDocumentTitle: "Dokument dales",
        status: "Statusi",
        reference: "Referenca",
        note: "Shenim",
        lines: "Rreshta",
        noLines: "Nuk ka rreshta.",
        addProduct: "Shto produkt",
        addProductToDocument: "Shto produkt ne kete dokument",
        quantity: "Sasia",
        bin: "Shporta",
        total: "Totali",
        clickForDetails: "Kliko per detaje",
        clickToOpenDocument: "Kliko dokumentin per te pare permbajtjen e tij",
        delete: "Fshi",
        confirm: "Konfirmo",
        cancel: "Anulo",
        exportPdf: "Eksporto PDF",
        cannotEdit: "Dokumenti nuk mund te editohet sepse nuk eshte me ne pergatitje.",
    },

    confirm: {
        title: "Konfirmim",
        confirmDocument: "A jeni i sigurt qe doni ta konfirmoni kete dokument?\nPas konfirmimit nuk mund te behen ndryshime.",
        cancelDocument: "A jeni i sigurt qe doni ta anuloni kete dokument?",
    },

    deleteLine: "A jeni i sigurt qe doni ta fshini kete rresht?",

    success: {
        created: "Dokumenti u krijua me sukses.",
        confirmed: "Dokumenti u konfirmua.",
        cancelled: "Dokumenti u anulua me sukses.",
        lineAdded: "Produkti u shtua me sukses.",
        lineDeleted: "Rreshti u fshi me sukses.",
    },

    dashboard: {
        title: "Paneli kryesor",
        welcome: "Mire se vini ne Sistemin e Menaxhimit te Depove (SMD).",

        cards: {
            inboundToday: {
                title: "Pranime sot",
                hint: "Dokumente te pranuara sot",
            },
            outboundToday: {
                title: "Dalje sot",
                hint: "Dokumente te derguara sot",
            },
            pendingDrafts: {
                title: "Dokumente ne pergatitje",
                hint: "Dokumente qe presin konfirmim",
            },
            products: {
                title: "Produkte",
                hint: "Produkte aktive ne sistem",
            },
            bins: {
                title: "Shporta",
                hint: "Shporta aktive ne depo",
            },
        },

        quickActions: {
            title: "Veprime te shpejta",
            inbound: "Pranime mallrash",
            outbound: "Dalje mallrash",
            description: "Shiko listen, detajet dhe eksportet e dokumenteve",
        },

        latestActivity: "Aktivitetet e fundit",
        controlCenter: "Qendra e kontrollit",
        systemSnapshot: "Pamje e shpejte",
        pendingDocuments: "Dokumente ne pergatitje",
        warehouseCoverage: "Mbulimi i depos",
        quickRecommendation: "Rekomandim i shpejte",
    },

    audit: {
        title: "Regjistri i auditimit",
        subtitle: "Shiko aktivitetet dhe gjurmen e ndryshimeve ne sistem.",
        search: "Kerko ne audit...",
        action: "Veprimi",
        all: "Te gjitha",
    },

    empty: {
        noData: "Nuk ka te dhena.",
    },

    errors: {
        notAllowed: "Ky veprim nuk lejohet.",
        insufficientStock: "Nuk ka sasi te mjaftueshme ne depo.",
    },

    sessionExpired: "Sesioni ka skaduar. Ju lutem kycuni perseri.",
} as const;
