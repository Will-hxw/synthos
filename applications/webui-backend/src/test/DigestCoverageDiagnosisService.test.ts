import "reflect-metadata";

import { describe, expect, it, vi, afterEach } from "vitest";
import { AIDIGEST_SESSION_STALE_MS } from "@root/common/services/database/constants/AIDigestSessionConstants";

import { DigestCoverageDiagnosisService } from "../services/DigestCoverageDiagnosisService";

describe("DigestCoverageDiagnosisService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("应按终态、历史话题、失败和 stale 窗口分类摘要覆盖状态", async () => {
        const now = 10_000_000;
        const staleBefore = now - AIDIGEST_SESSION_STALE_MS;
        const mockImDbAccessService = {
            getDigestCoverageSnapshotByGroupIdAndTimeRange: vi.fn().mockResolvedValue({
                rawMessageStats: {
                    messageCount: 80,
                    assignedMessageCount: 78,
                    unassignedMessageCount: 2,
                    assignedSessionCount: 8,
                    timeStart: 100,
                    timeEnd: 900,
                    unassignedTimeStart: 150,
                    unassignedTimeEnd: 160
                },
                unassignedMessageSamples: [
                    {
                        msgId: "msg-unassigned",
                        timestamp: 150,
                        senderId: "sender-1",
                        senderNickname: "发送者",
                        messageContent: "未分配消息"
                    }
                ],
                sessions: [
                    createSession("success-session", { status: "success", resultTopicCount: 0 }),
                    createSession("empty-session", { status: "empty", resultTopicCount: 0 }),
                    createSession("legacy-topic-session", { status: null, resultTopicCount: 1 }),
                    createSession("pending-session", { status: null, resultTopicCount: 0 }),
                    createSession("recent-failed-session", {
                        status: "failed",
                        updateTime: staleBefore + 1,
                        failReason: "模型失败"
                    }),
                    createSession("stale-failed-session", {
                        status: "failed",
                        updateTime: staleBefore - 1,
                        failReason: "旧失败"
                    }),
                    createSession("recent-processing-session", {
                        status: "processing",
                        updateTime: staleBefore - 10,
                        processingStartedAt: staleBefore + 1
                    }),
                    createSession("stale-processing-session", {
                        status: "processing",
                        updateTime: staleBefore - 10,
                        processingStartedAt: staleBefore - 1
                    })
                ]
            })
        };
        const service = new DigestCoverageDiagnosisService(mockImDbAccessService as any);

        vi.spyOn(Date, "now").mockReturnValue(now);

        const result = await service.getDigestCoverage({
            groupId: "group-a",
            timeStart: 100,
            timeEnd: 900,
            detailLimit: 100
        });

        expect(mockImDbAccessService.getDigestCoverageSnapshotByGroupIdAndTimeRange).toHaveBeenCalledWith(
            "group-a",
            100,
            900,
            100
        );
        expect(result.staleWindowMs).toBe(AIDIGEST_SESSION_STALE_MS);
        expect(result.staleBefore).toBe(staleBefore);
        expect(result.rawMessages).toEqual({
            totalCount: 80,
            assignedCount: 78,
            unassignedCount: 2,
            timeStart: 100,
            timeEnd: 900
        });
        expect(result.sessions).toEqual({
            totalCount: 8,
            coveredCount: 3,
            pendingCount: 1,
            recentFailedCount: 1,
            staleCount: 2,
            recentProcessingCount: 1
        });
        expect(result.pendingSessions.items.map(item => item.sessionId)).toEqual(["pending-session"]);
        expect(result.recentFailedSessions.items.map(item => item.sessionId)).toEqual(["recent-failed-session"]);
        expect(result.staleSessions.items.map(item => item.sessionId)).toEqual([
            "stale-failed-session",
            "stale-processing-session"
        ]);
        expect(result.unassignedMessages.count).toBe(2);
        expect(result.unassignedMessages.items[0].msgId).toBe("msg-unassigned");
    });

    it("明细应按 detailLimit 截断但保留准确计数", async () => {
        const now = 10_000_000;
        const mockImDbAccessService = {
            getDigestCoverageSnapshotByGroupIdAndTimeRange: vi.fn().mockResolvedValue({
                rawMessageStats: {
                    messageCount: 3,
                    assignedMessageCount: 3,
                    unassignedMessageCount: 0,
                    assignedSessionCount: 3,
                    timeStart: 100,
                    timeEnd: 300,
                    unassignedTimeStart: null,
                    unassignedTimeEnd: null
                },
                unassignedMessageSamples: [],
                sessions: [
                    createSession("pending-1", { status: null, resultTopicCount: 0 }),
                    createSession("pending-2", { status: null, resultTopicCount: 0 }),
                    createSession("pending-3", { status: null, resultTopicCount: 0 })
                ]
            })
        };
        const service = new DigestCoverageDiagnosisService(mockImDbAccessService as any);

        vi.spyOn(Date, "now").mockReturnValue(now);

        const result = await service.getDigestCoverage({
            groupId: "group-a",
            timeStart: 100,
            timeEnd: 300,
            detailLimit: 2
        });

        expect(result.pendingSessions.count).toBe(3);
        expect(result.pendingSessions.items.map(item => item.sessionId)).toEqual(["pending-1", "pending-2"]);
    });
});

function createSession(
    sessionId: string,
    overrides: Partial<{
        status: string | null;
        updateTime: number | null;
        processingStartedAt: number | null;
        failReason: string | null;
        resultTopicCount: number;
    }>
) {
    return {
        sessionId,
        messageCount: 10,
        timeStart: 100,
        timeEnd: 200,
        status: null,
        updateTime: null,
        processingStartedAt: null,
        failReason: null,
        statusTopicCount: null,
        resultTopicCount: 0,
        ...overrides
    };
}
