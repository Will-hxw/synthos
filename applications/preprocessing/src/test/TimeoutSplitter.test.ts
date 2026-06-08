import "reflect-metadata";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRandomHash } = vi.hoisted(() => ({
    mockGetRandomHash: vi.fn()
}));

vi.mock("@root/common/util/math/getRandomHash", () => ({
    default: mockGetRandomHash
}));

import { TimeoutSplitter } from "../splitters/TimeoutSplitter";

describe("TimeoutSplitter", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("上一条 session 未进入摘要生命周期且未超时时应继续复用", async () => {
        const currentMessage = createMessage("msg-current", undefined, 6 * 60 * 1000);
        const mockAgcDbAccessService = createAgcDbAccessService(false);
        const splitter = createSplitter(
            [createMessage("msg-prev", "open-session", 0), currentMessage],
            mockAgcDbAccessService
        );

        await splitter.init();
        const result = await splitter.assignSessionId("group-a", 0, 10 * 60 * 1000);

        expect(result[1].sessionId).toBe("open-session");
        expect(mockAgcDbAccessService.isSessionIdProcessed).toHaveBeenCalledWith("open-session");
        expect(mockGetRandomHash).not.toHaveBeenCalled();
    });

    it("上一条 session 已进入摘要生命周期时应强制开启新 session", async () => {
        mockGetRandomHash.mockReturnValue("generated-session");

        const currentMessage = createMessage("msg-current", undefined, 6 * 60 * 1000);
        const splitter = createSplitter(
            [createMessage("msg-prev", "closed-session", 0), currentMessage],
            createAgcDbAccessService(true)
        );

        await splitter.init();
        const result = await splitter.assignSessionId("group-a", 0, 10 * 60 * 1000);

        expect(result[1].sessionId).toBe("generated-session");
        expect(mockGetRandomHash).toHaveBeenCalledOnce();
    });

    it("消息间隔超过阈值时仍应开启新 session", async () => {
        mockGetRandomHash.mockReturnValue("generated-timeout-session");

        const mockAgcDbAccessService = createAgcDbAccessService(false);
        const currentMessage = createMessage("msg-current", undefined, 11 * 60 * 1000);
        const splitter = createSplitter(
            [createMessage("msg-prev", "timeout-session", 0), currentMessage],
            mockAgcDbAccessService
        );

        await splitter.init();
        const result = await splitter.assignSessionId("group-a", 0, 20 * 60 * 1000);

        expect(result[1].sessionId).toBe("generated-timeout-session");
        expect(mockAgcDbAccessService.isSessionIdProcessed).not.toHaveBeenCalled();
    });
});

function createSplitter(messages: any[], mockAgcDbAccessService: any): TimeoutSplitter {
    const mockConfigManagerService = {
        getCurrentConfig: vi.fn().mockResolvedValue({
            preprocessors: {
                TimeoutSplitter: {
                    timeoutInMinutes: 10
                }
            }
        })
    };
    const mockImDbAccessService = {
        init: vi.fn().mockResolvedValue(undefined),
        getProcessedChatMessageWithRawMessageByGroupIdAndTimeRange: vi.fn().mockResolvedValue(messages)
    };

    return new TimeoutSplitter(
        mockConfigManagerService as any,
        mockImDbAccessService as any,
        mockAgcDbAccessService as any
    );
}

function createAgcDbAccessService(processed: boolean) {
    return {
        isSessionIdProcessed: vi.fn().mockResolvedValue(processed)
    };
}

function createMessage(msgId: string, sessionId: string | undefined, timestamp: number) {
    return {
        msgId,
        messageContent: `消息 ${msgId}`,
        groupId: "group-a",
        timestamp,
        senderId: "sender",
        senderGroupNickname: "发送者",
        senderNickname: "发送者",
        sessionId,
        preProcessedContent: ""
    };
}
