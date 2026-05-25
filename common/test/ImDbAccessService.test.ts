import "reflect-metadata";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { container } from "tsyringe";

import { COMMON_TOKENS } from "../di/tokens";
import { ImDbAccessService } from "../services/database/ImDbAccessService";

describe("ImDbAccessService", () => {
    const mockCommonDBService = {
        init: vi.fn(),
        get: vi.fn()
    };

    beforeEach(() => {
        container.reset();
        vi.clearAllMocks();
        mockCommonDBService.init.mockResolvedValue(undefined);
        container.registerInstance(COMMON_TOKENS.CommonDBService, mockCommonDBService as any);
    });

    it("根据不存在的消息id查询raw消息时应抛错", async () => {
        mockCommonDBService.get.mockResolvedValue(undefined);
        const service = new ImDbAccessService();

        await service.init();

        await expect(service.getRawChatMessageByMsgId("missing-msg")).rejects.toThrow(
            "消息不存在，msgId: missing-msg"
        );
        expect(mockCommonDBService.get).toHaveBeenCalledWith("SELECT * FROM chat_messages WHERE msgId =?", [
            "missing-msg"
        ]);
    });
});
