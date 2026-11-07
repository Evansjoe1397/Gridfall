/// <reference types="vite/client" />

declare const __GRIDFALL_BUILD__: { commit: string | null; dirty: boolean | null; builtAt: string };
declare const __GRIDFALL_ASSETS__: Record<string, { url: string; bytes: number }>;
declare const __GRIDFALL_ARTWORK_BYTES__: Record<string, number>;
