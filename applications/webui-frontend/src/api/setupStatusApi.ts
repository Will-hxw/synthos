import type { ApiResponse } from "@/types/api";

import API_BASE_URL from "./constants/baseUrl";

import { MOCK_ENABLED } from "@/config/mock";
import fetchWrapper from "@/util/fetchWrapper";

export interface QQSourceReconcileStatus {
    groupId: string;
    cursor: { msgId: string; timestamp: number } | null;
    nextCursor: { msgId: string; timestamp: number } | null;
    scannedCount: number;
    missingCount: number;
    insertedCount: number;
    reachedEnd: boolean;
    wrapped: boolean;
    batchSize: number;
    updatedAt: number;
}

export interface SetupStatusCheck {
    key: string;
    status: "ok" | "warning" | "error";
    message: string;
}

export interface SetupStatus {
    generatedAt: number;
    groupCount: number;
    configuredGroupIds: string[];
    embedding: {
        ollamaBaseURL: string;
        model: string;
        reachable: boolean;
        modelInstalled: boolean;
        error?: string;
    };
    qqSourceReconcile: QQSourceReconcileStatus[];
    checks: SetupStatusCheck[];
}

export const getSetupStatus = async (): Promise<ApiResponse<SetupStatus>> => {
    if (MOCK_ENABLED) {
        return {
            success: true,
            data: {
                generatedAt: Date.now(),
                groupCount: 1,
                configuredGroupIds: ["mock-group"],
                embedding: {
                    ollamaBaseURL: "http://localhost:11434",
                    model: "bge-m3",
                    reachable: true,
                    modelInstalled: true
                },
                qqSourceReconcile: [],
                checks: []
            },
            message: ""
        };
    }

    const response = await fetchWrapper(`${API_BASE_URL}/api/setup-status`);

    return response.json();
};
