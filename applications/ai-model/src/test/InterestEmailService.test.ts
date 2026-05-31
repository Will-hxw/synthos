import "reflect-metadata";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { InterestEmailService } from "../services/email/InterestEmailService";

const { mockLogger } = vi.hoisted(() => ({
    mockLogger: {
        debug: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock("@root/common/util/Logger", () => ({
    default: {
        withTag: () => mockLogger
    }
}));

describe("InterestEmailService", () => {
    const mockConfigManagerService = {
        getCurrentConfig: vi.fn()
    };
    const mockEmailService = {
        sendEmail: vi.fn(),
        escapeHtml: vi.fn((value: string) => value)
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockConfigManagerService.getCurrentConfig.mockResolvedValue({
            email: {
                enabled: false
            }
        });
    });

    it("邮件关闭时应返回 skipped 且不调用底层发送服务", async () => {
        const service = new InterestEmailService(mockConfigManagerService as any, mockEmailService as any);

        const result = await service.sendInterestTopicsEmail([
            {
                topicId: "topic-1",
                sessionId: "session-1",
                topic: "测试话题",
                detail: "测试详情",
                contributors: "[]",
                modelName: "mock-model",
                updateTime: 1
            }
        ]);

        expect(result).toBe("skipped");
        expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it("contributors 为非法 JSON / 字面 undefined 时不应抛错且仍发送邮件", async () => {
        mockConfigManagerService.getCurrentConfig.mockResolvedValue({
            email: { enabled: true }
        });
        mockEmailService.sendEmail.mockResolvedValue(true);

        const service = new InterestEmailService(mockConfigManagerService as any, mockEmailService as any);

        const result = await service.sendInterestTopicsEmail([
            {
                topicId: "topic-1",
                sessionId: "session-1",
                topic: "话题1",
                detail: "详情1",
                contributors: "undefined",
                modelName: "mock-model",
                updateTime: 1
            },
            {
                topicId: "topic-2",
                sessionId: "session-2",
                topic: "话题2",
                detail: "详情2",
                contributors: '["张三","李四"]',
                modelName: "mock-model",
                updateTime: 2
            }
        ]);

        expect(result).toBe("sent");
        expect(mockEmailService.sendEmail).toHaveBeenCalledOnce();
        const sentHtml = mockEmailService.sendEmail.mock.calls[0][0].html as string;

        expect(sentHtml).toContain("张三、李四");
    });
});
