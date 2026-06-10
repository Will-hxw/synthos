export const QQ_SOURCE_RECONCILE_STATUS_PREFIX = "qq-source-reconcile-status";

export interface QQSourceReconcileCursorSnapshot {
    msgId: string;
    timestamp: number;
}

export interface QQSourceReconcileStatus {
    groupId: string;
    cursor: QQSourceReconcileCursorSnapshot | null;
    nextCursor: QQSourceReconcileCursorSnapshot | null;
    scannedCount: number;
    missingCount: number;
    insertedCount: number;
    quoteRepairCount?: number;
    reachedEnd: boolean;
    wrapped: boolean;
    batchSize: number;
    updatedAt: number;
}
