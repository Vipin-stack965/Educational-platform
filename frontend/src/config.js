const configuredServerUrl = import.meta.env.VITE_SERVER_URL?.trim()
export const serverUrl = (configuredServerUrl || (import.meta.env.DEV ? "" : window.location.origin)).replace(/\/+$/, "")
