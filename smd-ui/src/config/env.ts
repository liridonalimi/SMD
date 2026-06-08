const isAdbReverseOrigin =
    window.location.hostname === "127.0.0.1" &&
    window.location.port === "5173";

export const env = {
    apiBaseUrl: isAdbReverseOrigin ? "" : import.meta.env.VITE_API_BASE_URL ?? "",
};
