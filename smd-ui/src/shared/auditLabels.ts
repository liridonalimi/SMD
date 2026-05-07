// src/shared/auditLabels.ts
export function auditActionLabel(action: string) {
    switch ((action ?? "").trim().toUpperCase()) {
        case "ADD_LINE_INBOUND":
            return "U shtua nje rresht ne dokumentin hyres (inbound)";
        case "DELETE_LINE_INBOUND":
            return "U fshi nje rresht nga dokumenti hyres (inbound)";
        case "CONFIRM_INBOUND":
            return "U konfirmua dokumentin hyres (inbound)";
        case "CANCEL_INBOUND":
            return "U anulua dokumentin hyres (inbound)";

        case "ADD_LINE_OUTBOUND":
            return "U shtua nje rresht ne dokumentin dales (outbound)";
        case "DELETE_LINE_OUTBOUND":
            return "U fshi rresht nga dokumenti dales (outbound)";
        case "CONFIRM_OUTBOUND":
            return "U konfirmua dokumenti dales (outbound)";
        case "CANCEL_OUTBOUND":
            return "U anulua dokumenti dales (outbound)";

        case "EXPORT_INBOUND_PDF":
            return "U eksportua PDF i hyrjes, dokumentit hyres (inbound)";
        case "EXPORT_OUTBOUND_PDF":
            return "U eksportua PDF i daljes, dokumentit dales (outbound)";
        case "EXPORT_INVENTORY_CSV":
            return "U eksportua inventari (CSV)";
        case "EXPORT_STOCKMOVEMENTS_CSV":
            return "U eksportuan levizjet e stokut (CSV)";

        default:
            return action || "Veprim";
    }
}

export function auditEntityLabel(entity: string) {
    // nëse entity s’të vlen për klientin, mund ta thjeshtosh
    const e = (entity ?? "").trim().toLowerCase();
    if (e.includes("inbound")) return "Pranim malli";
    if (e.includes("outbound")) return "Dalje malli";
    if (e.includes("inventory")) return "Inventar";
    if (e.includes("stock")) return "Stok";

    return entity || "Entitet";
}
