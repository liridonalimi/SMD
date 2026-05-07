// src/shared/documentRules.ts
import type { DocumentStatus } from "./documentStatus";

export const canEditLines = (s: DocumentStatus) => s === 0;          // vetëm Draft
export const canConfirm = (s: DocumentStatus) => s === 0;            // vetëm Draft
export const canCancel = (s: DocumentStatus) => s === 0 || s === 1;  // Draft/Confirmed
