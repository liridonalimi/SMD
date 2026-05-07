// src/shared/errors.ts
export function errorMessage(e: unknown) {
    if (e instanceof Error) return e.message;
    return "Ndodhi një gabim. Ju lutem provoni përsëri.";
}
