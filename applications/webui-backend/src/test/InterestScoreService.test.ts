import "reflect-metadata";

import { describe, expect, it, vi } from "vitest";

import { InterestScoreService } from "../services/InterestScoreService";

describe("InterestScoreService", () => {
    it("应通过公共数据库服务批量读取兴趣分", async () => {
        const topicIds = ["topic-1", "topic-2", "topic-1"];
        const expectedResults = [
            { topicId: "topic-1", score: 0.75 },
            { topicId: "topic-2", score: null },
            { topicId: "topic-1", score: 0.75 }
        ];
        const mockInterestScoreDbAccessService = {
            getInterestScoreResults: vi.fn().mockResolvedValue(expectedResults),
            getInterestScoreResult: vi.fn()
        };
        const service = new InterestScoreService(mockInterestScoreDbAccessService as any);

        const result = await service.getInterestScoreResults(topicIds);

        expect(result).toBe(expectedResults);
        expect(mockInterestScoreDbAccessService.getInterestScoreResults).toHaveBeenCalledTimes(1);
        expect(mockInterestScoreDbAccessService.getInterestScoreResults).toHaveBeenCalledWith(topicIds);
        expect(mockInterestScoreDbAccessService.getInterestScoreResult).not.toHaveBeenCalled();
    });
});
