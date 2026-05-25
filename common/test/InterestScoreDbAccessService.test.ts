import "reflect-metadata";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { container } from "tsyringe";

import { COMMON_TOKENS } from "../di/tokens";
import { InterestScoreDbAccessService } from "../services/database/InterestScoreDbAccessService";

describe("InterestScoreDbAccessService", () => {
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

    it("读取兴趣分时应保留0分结果", async () => {
        mockCommonDBService.get.mockResolvedValue({ score: 0 });
        const service = new InterestScoreDbAccessService();

        await service.init();
        const result = await service.getInterestScoreResult("topic-1");

        expect(result).toBe(0);
        expect(mockCommonDBService.get).toHaveBeenCalledWith(
            "SELECT scoreV1 AS score FROM interset_score_results WHERE topicId = ?",
            ["topic-1"]
        );
    });

    it("读取兴趣分时应按传入版本读取对应分数列", async () => {
        mockCommonDBService.get.mockResolvedValue({ score: 0.75 });
        const service = new InterestScoreDbAccessService();

        await service.init();
        const result = await service.getInterestScoreResult("topic-2", 2);

        expect(result).toBe(0.75);
        expect(mockCommonDBService.get).toHaveBeenCalledWith(
            "SELECT scoreV2 AS score FROM interset_score_results WHERE topicId = ?",
            ["topic-2"]
        );
    });

    it("查询不到兴趣分时应返回null", async () => {
        mockCommonDBService.get.mockResolvedValue(undefined);
        const service = new InterestScoreDbAccessService();

        await service.init();
        const result = await service.getInterestScoreResult("missing-topic");

        expect(result).toBeNull();
    });
});
