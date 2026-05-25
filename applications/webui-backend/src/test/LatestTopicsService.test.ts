import "reflect-metadata";

import type { GetLatestTopicsParams } from "../schemas/index";
import type { LatestTopicRecord } from "@root/common/services/database/AgcDbAccessService";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { LatestTopicsService } from "../services/LatestTopicsService";

const createRecord = (topicId: string): LatestTopicRecord => ({
    topicId,
    sessionId: `session-${topicId}`,
    topic: `topic-${topicId}`,
    contributors: "[]",
    detail: `detail-${topicId}`,
    modelName: "model",
    updateTime: 1000,
    timeStart: 900,
    timeEnd: 1000,
    groupId: "group-1",
    interestScore: 0.5
});

const createParams = (overrides: Partial<GetLatestTopicsParams> = {}): GetLatestTopicsParams => ({
    timeStart: 0,
    timeEnd: 2000,
    page: 2,
    pageSize: 3,
    filterRead: false,
    filterFavorite: false,
    sortByInterest: false,
    search: "",
    ...overrides
});

describe("LatestTopicsService", () => {
    const mockAgcDbAccessService = {
        getLatestTopicRecordsPageByTimeRange: vi.fn()
    };
    const mockTopicStatusService = {
        getReadTopicIds: vi.fn(),
        getFavoriteTopicIds: vi.fn(),
        checkReadStatus: vi.fn(),
        checkFavoriteStatus: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockAgcDbAccessService.getLatestTopicRecordsPageByTimeRange.mockResolvedValue({
            records: [createRecord("topic-1"), createRecord("topic-2")],
            total: 42
        });
        mockTopicStatusService.getReadTopicIds.mockResolvedValue(["read-topic"]);
        mockTopicStatusService.getFavoriteTopicIds.mockResolvedValue(["fav-topic"]);
        mockTopicStatusService.checkReadStatus.mockResolvedValue({
            "topic-1": false,
            "topic-2": true
        });
        mockTopicStatusService.checkFavoriteStatus.mockResolvedValue({
            "topic-1": true,
            "topic-2": false
        });
    });

    it("不筛选状态时应直接使用数据库分页结果并只检查当前页状态", async () => {
        const service = new LatestTopicsService(mockAgcDbAccessService as any, mockTopicStatusService as any);

        const result = await service.getLatestTopics(createParams({ groupId: "group-1", search: " Topic " }));

        expect(mockAgcDbAccessService.getLatestTopicRecordsPageByTimeRange).toHaveBeenCalledWith({
            timeStart: 0,
            timeEnd: 2000,
            page: 2,
            pageSize: 3,
            groupId: "group-1",
            searchText: "topic",
            sortByInterest: false,
            excludeTopicIds: undefined,
            includeTopicIds: undefined
        });
        expect(mockTopicStatusService.getReadTopicIds).not.toHaveBeenCalled();
        expect(mockTopicStatusService.getFavoriteTopicIds).not.toHaveBeenCalled();
        expect(mockTopicStatusService.checkReadStatus).toHaveBeenCalledWith(["topic-1", "topic-2"]);
        expect(mockTopicStatusService.checkFavoriteStatus).toHaveBeenCalledWith(["topic-1", "topic-2"]);
        expect(result.total).toBe(42);
        expect(result.topics.map(topic => topic.topicId)).toEqual(["topic-1", "topic-2"]);
    });

    it("筛选已读和收藏时应把topicId列表传给数据库并避免逐条状态检查", async () => {
        const service = new LatestTopicsService(mockAgcDbAccessService as any, mockTopicStatusService as any);

        const result = await service.getLatestTopics(
            createParams({
                filterRead: true,
                filterFavorite: true,
                sortByInterest: true
            })
        );

        expect(mockAgcDbAccessService.getLatestTopicRecordsPageByTimeRange).toHaveBeenCalledWith({
            timeStart: 0,
            timeEnd: 2000,
            page: 2,
            pageSize: 3,
            groupId: undefined,
            searchText: "",
            sortByInterest: true,
            excludeTopicIds: ["read-topic"],
            includeTopicIds: ["fav-topic"]
        });
        expect(mockTopicStatusService.checkReadStatus).not.toHaveBeenCalled();
        expect(mockTopicStatusService.checkFavoriteStatus).not.toHaveBeenCalled();
        expect(result.readStatus).toEqual({
            "topic-1": false,
            "topic-2": false
        });
        expect(result.favoriteStatus).toEqual({
            "topic-1": true,
            "topic-2": true
        });
    });
});
