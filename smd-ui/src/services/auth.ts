import { env } from "../config/env";
import { setToken } from "./token";

export type LoginRequest = {
    email: string;
    password: string;
};

export type LoginResponse = {
    token: string;
};

export async function login(req: LoginRequest, signal?: AbortSignal): Promise<LoginResponse> {
    const res = await fetch(`${env.apiBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
    }

    const data = (await res.json()) as LoginResponse;
    setToken(data.token); //  ruaje tokenin këtu
    return data;
}
