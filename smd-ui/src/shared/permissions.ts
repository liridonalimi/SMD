import type { UserRole } from "./session";

// 0 Admin, 3 Manager, 2 Supervisor, 1 Worker

export function canViewAudit(role?: UserRole) {
    return role === 0; // vetem Admin
}

export function canManageUsers(role?: UserRole) {
    return role === 0; // vetem Admin
}

export function canEditMasterData(role?: UserRole) {
    return role === 0 || role === 3; // Admin/Manager
}

export function canMoveStockDirectly(role?: UserRole) {
    return role === 0; // vetem Admin
}

export function canApproveDocuments(role?: UserRole) {
    return role === 0 || role === 2 || role === 3; // Admin/Supervisor/Manager
}

export function canEditDraftLines(role?: UserRole) {
    return role === 0 || role === 1 || role === 2 || role === 3; // te gjithe
}
