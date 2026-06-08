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
