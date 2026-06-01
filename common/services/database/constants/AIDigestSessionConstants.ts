export const AIDIGEST_SESSION_STALE_MS = 2 * 60 * 60 * 1000;

export const AIDIGEST_SESSION_STATUSES = {
    processing: "processing",
    success: "success",
    empty: "empty",
    failed: "failed"
} as const;

export type AIDigestSessionStatus = (typeof AIDIGEST_SESSION_STATUSES)[keyof typeof AIDIGEST_SESSION_STATUSES];
