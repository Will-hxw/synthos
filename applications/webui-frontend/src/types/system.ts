export interface EmbeddingRuntimeStatus {
    model: string;
    ollamaReachable: boolean;
    modelInstalled: boolean;
    vectorTopicCount: number;
    checkedAt: number;
    error?: string;
}

export interface SystemRuntimeStats {
    aiModelReachable: boolean;
    embedding: EmbeddingRuntimeStatus | null;
    error?: string;
}

export interface SystemStats {
    timestamp: number;
    storage: {
        chatRecordDB: { count: number; size: number };
        imMessageFtsDB: { count: number; size: number };
        aiDialogueDB: { count: number; size: number };
        vectorDB: { count: number; size: number };
        kvStoreBackend: { count: number; size: number };
        kvStorePersistent: { count: number; size: number };
        logs: { count: number; size: number };
        totalSize: number;
    };
    modules: Record<string, { cpu: number; memory: number }>;
    runtime: SystemRuntimeStats;
}
