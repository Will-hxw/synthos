import type { ApiResponse } from "@/types/api";

import API_BASE_URL from "./constants/baseUrl";

import { MOCK_ENABLED } from "@/config/mock";
import fetchWrapper from "@/util/fetchWrapper";

export interface DigestCoverageRequest {
    groupId: string;
    timeStart: number;
    timeEnd: number;
    detailLimit?: number;
}

export interface DigestCoverageSessionDetail {
    sessionId: string;
    messageCount: number;
    timeStart: number;
    timeEnd: number;
    status: string | null;
    updateTime: number | null;
    processingStartedAt: number | null;
    failReason: string | null;
    topicCount: number;
}

export interface DigestCoverageSessionCategory {
    count: number;
    items: DigestCoverageSessionDetail[];
}

export interface DigestCoverageUnassignedMessageSample {
    msgId: string;
    timestamp: number;
    senderId: string | null;
    senderNickname: string | null;
    messageContent: string | null;
}

export interface DigestCoverageResult {
    generatedAt: number;
    groupId: string;
    timeStart: number;
    timeEnd: number;
    staleWindowMs: number;
    staleBefore: number;
    detailLimit: number;
    rawMessages: {
        totalCount: number;
        assignedCount: number;
        unassignedCount: number;
        timeStart: number | null;
        timeEnd: number | null;
    };
    sessions: {
        totalCount: number;
        coveredCount: number;
        pendingCount: number;
        recentFailedCount: number;
        staleCount: number;
        recentProcessingCount: number;
    };
    unassignedMessages: {
        count: number;
        timeStart: number | null;
        timeEnd: number | null;
        items: DigestCoverageUnassignedMessageSample[];
    };
    pendingSessions: DigestCoverageSessionCategory;
    recentFailedSessions: DigestCoverageSessionCategory;
    staleSessions: DigestCoverageSessionCategory;
}

export const getDigestCoverage = async (params: DigestCoverageRequest): Promise<ApiResponse<DigestCoverageResult>> => {
    if (MOCK_ENABLED) {
        const now = Date.now();

        return {
            success: true,
            data: {
                generatedAt: now,
                groupId: params.groupId,
                timeStart: params.timeStart,
                timeEnd: params.timeEnd,
                staleWindowMs: 2 * 60 * 60 * 1000,
                staleBefore: now - 2 * 60 * 60 * 1000,
                detailLimit: params.detailLimit ?? 100,
                rawMessages: {
                    totalCount: 32,
                    assignedCount: 30,
                    unassignedCount: 2,
                    timeStart: params.timeStart,
                    timeEnd: params.timeEnd
                },
                sessions: {
                    totalCount: 5,
                    coveredCount: 2,
                    pendingCount: 1,
                    recentFailedCount: 1,
                    staleCount: 1,
                    recentProcessingCount: 0
                },
                unassignedMessages: {
                    count: 2,
                    timeStart: params.timeStart,
                    timeEnd: params.timeStart + 60_000,
                    items: []
                },
                pendingSessions: {
                    count: 1,
                    items: [
                        {
                            sessionId: "mock-pending-session",
                            messageCount: 12,
                            timeStart: params.timeStart,
                            timeEnd: params.timeStart + 10_000,
                            status: null,
                            updateTime: null,
                            processingStartedAt: null,
                            failReason: null,
                            topicCount: 0
                        }
                    ]
                },
                recentFailedSessions: {
                    count: 1,
                    items: [
                        {
                            sessionId: "mock-recent-failed-session",
                            messageCount: 5,
                            timeStart: params.timeStart + 20_000,
                            timeEnd: params.timeStart + 30_000,
                            status: "failed",
                            updateTime: now,
                            processingStartedAt: null,
                            failReason: "mock failure",
                            topicCount: 0
                        }
                    ]
                },
                staleSessions: {
                    count: 1,
                    items: [
                        {
                            sessionId: "mock-stale-session",
                            messageCount: 13,
                            timeStart: params.timeStart + 40_000,
                            timeEnd: params.timeStart + 50_000,
                            status: "processing",
                            updateTime: now - 3 * 60 * 60 * 1000,
                            processingStartedAt: now - 3 * 60 * 60 * 1000,
                            failReason: null,
                            topicCount: 0
                        }
                    ]
                }
            },
            message: ""
        };
    }

    const response = await fetchWrapper(`${API_BASE_URL}/api/setup-status/digest-coverage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params)
    });

    return response.json();
};
