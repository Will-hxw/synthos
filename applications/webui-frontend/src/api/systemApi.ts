import type { ApiResponse } from "@/types/api";
import type { SystemStats } from "@/types/system";

import API_BASE_URL from "./constants/baseUrl";

import fetchWrapper from "@/util/fetchWrapper";
import { MOCK_ENABLED } from "@/config/mock";

const mockSystemStats: SystemStats = {
    timestamp: Date.now(),
    storage: {
        chatRecordDB: { count: 0, size: 0 },
        imMessageFtsDB: { count: 0, size: 0 },
        aiDialogueDB: { count: 0, size: 0 },
        vectorDB: { count: 0, size: 0 },
        kvStoreBackend: { count: 0, size: 0 },
        kvStorePersistent: { count: 0, size: 0 },
        logs: { count: 0, size: 0 },
        totalSize: 0
    },
    modules: {},
    runtime: {
        aiModelReachable: true,
        embedding: {
            model: "bge-m3",
            ollamaReachable: true,
            modelInstalled: true,
            vectorTopicCount: 8,
            checkedAt: Date.now()
        }
    }
};

export const getLatestSystemStats = async (): Promise<ApiResponse<SystemStats | null>> => {
    if (MOCK_ENABLED) {
        return {
            success: true,
            data: mockSystemStats,
            message: ""
        };
    }

    const response = await fetchWrapper(`${API_BASE_URL}/api/system/monitor/latest`);

    return response.json();
};
