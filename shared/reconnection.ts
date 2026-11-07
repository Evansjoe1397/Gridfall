// Keep the retry budget aligned with the server's seat reservation window.
export const RECONNECT_WINDOW_SECONDS = 300;
export const RECONNECT_MAX_DELAY_MS = 2500;
export const RECONNECT_MAX_RETRIES = 125;
