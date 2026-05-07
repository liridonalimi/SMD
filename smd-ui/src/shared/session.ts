/*
import { getToken } from "../services/token";

export type UserRole = 0 | 1 | 2 | 3; // Admin=0, Worker=1, Supervisor=2, Manager=3

export type SessionUser = {
    userId?: string;
    email?: string;
    role?: UserRole;
};

function base64UrlDecode(input: string) {
    const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (base64.length % 4)) % 4);
    return atob(base64 + pad);
}

function readJwtPayload(): Record<string, unknown> | null {
    const token = getToken();
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length < 2) return null;

    try {
        return JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
    } catch {
        return null;
    }
}

function pickString(p: Record<string, unknown> | null, key: string) {
    const v = p?.[key];
    return typeof v === "string" ? v : undefined;
}
function pickNumber(p: Record<string, unknown> | null, key: string) {
    const v = p?.[key];
    return typeof v === "number" ? v : undefined;
}

export function getSessionUser(): SessionUser | null {
    const p = readJwtPayload();
    if (!p) return null;

    // role mund të vijë si number ose string-number
    const roleRaw =
        pickNumber(p, "role") ??
        pickNumber(p, "http://schemas.microsoft.com/ws/2008/06/identity/claims/role");

    const roleStr =
        pickString(p, "role") ??
        pickString(p, "http://schemas.microsoft.com/ws/2008/06/identity/claims/role");

    const roleNum =
        roleRaw ??
        (roleStr && Number.isFinite(Number(roleStr)) ? Number(roleStr) : undefined);

    const role =
        roleNum === 0 || roleNum === 1 || roleNum === 2 || roleNum === 3
            ? (roleNum as UserRole)
            : undefined;

    const email =
        pickString(p, "email") ??
        pickString(p, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress");

    const userId =
        pickString(p, "sub") ??
        pickString(p, "nameid") ??
        pickString(p, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier");

    return { role, email, userId };
}

export function roleLabel(role?: UserRole) {
    switch (role) {
        case 0:
            return "Admin";
        case 1:
            return "Punetor";
        case 2:
            return "Mbikeqyres";
        case 3:
            return "Menaxher";
        default:
            return "E panjohur";
    }
}
*/

// src/shared/session.ts

export type UserRole = 0 | 1 | 2 | 3;

export type SessionUser = {
    userId?: string;
    email?: string;
    role?: UserRole;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readJwtPayload(): any | null {
    const token = localStorage.getItem("smd_token");
    if (!token) return null;

    try {
        return JSON.parse(
            atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
        );
    } catch {
        return null;
    }
}

function normalizeRole(raw: unknown): UserRole | undefined {
    if (typeof raw === "string") {
        const v = raw.toLowerCase();
        if (v === "admin") return 0;
        if (v === "worker") return 1;
        if (v === "supervisor") return 2;
        if (v === "manager") return 3;
    }

    if (typeof raw === "number") {
        if (raw === 0 || raw === 1 || raw === 2 || raw === 3)
            return raw as UserRole;
    }

    return undefined;
}

export function getSessionUser(): SessionUser | null {
    const p = readJwtPayload();
    if (!p) return null;

    const userId =
        p["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"];

    const email =
        p["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"];

    const roleRaw =
        p["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"];

    const role = normalizeRole(roleRaw);

    return { userId, email, role };
}

// opsionale – për UI
export function roleLabel(role?: UserRole) {
    if (role === 0) return "Admin";
    if (role === 1) return "Punëtor";
    if (role === 2) return "Mbikëqyrës";
    if (role === 3) return "Menaxher";
    return "—";
}
