import type { DocumentStatus } from "./documentStatus";
import type { UserRole } from "./session";
import { canEditLines, canConfirm, canCancel } from "./documentRules";
import { canApproveDocuments, canEditDraftLines } from "./permissions";

// Vendime finale (STATUS + ROLE)
export function canEditDocumentLines(status: DocumentStatus, role?: UserRole) {
    return canEditLines(status) && canEditDraftLines(role);
}

export function canConfirmDocument(status: DocumentStatus, role?: UserRole) {
    return canConfirm(status) && canApproveDocuments(role);
}

export function canCancelDocument(status: DocumentStatus, role?: UserRole) {
    return canCancel(status) && canApproveDocuments(role);
}
