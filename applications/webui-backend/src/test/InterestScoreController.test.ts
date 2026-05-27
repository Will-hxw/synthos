import "reflect-metadata";

import type { Request, Response } from "express";

import { describe, expect, it, vi } from "vitest";

import { InterestScoreController } from "../controllers/InterestScoreController";

describe("InterestScoreController", () => {
    it("应保持兴趣分批量查询接口的响应契约", async () => {
        const topicIds = ["topic-1", "topic-2"];
        const expectedResults = [
            { topicId: "topic-1", score: 0 },
            { topicId: "topic-2", score: null }
        ];
        const mockInterestScoreService = {
            getInterestScoreResults: vi.fn().mockResolvedValue(expectedResults)
        };
        const controller = new InterestScoreController(mockInterestScoreService as any);
        const req = { body: { topicIds } } as Request;
        const res = { json: vi.fn() } as unknown as Response;

        await controller.getInterestScoreResults(req, res);

        expect(mockInterestScoreService.getInterestScoreResults).toHaveBeenCalledWith(topicIds);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expectedResults
        });
    });
});
