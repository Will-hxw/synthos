/**
 * 最新话题查询服务
 */
import type { LatestTopicRecord } from "@root/common/services/database/AgcDbAccessService";
import type { GetLatestTopicsParams } from "../schemas/index";

import { injectable, inject } from "tsyringe";
import { AgcDbAccessService } from "@root/common/services/database/AgcDbAccessService";

import { TOKENS } from "../di/tokens";

import { TopicStatusService } from "./TopicStatusService";

export type LatestTopicItem = Omit<LatestTopicRecord, "interestScore">;

export interface LatestTopicsResponse {
    topics: LatestTopicItem[];
    total: number;
    page: number;
    pageSize: number;
    readStatus: Record<string, boolean>;
    favoriteStatus: Record<string, boolean>;
    interestScores: Record<string, number>;
}

@injectable()
export class LatestTopicsService {
    public constructor(
        @inject(TOKENS.AgcDbAccessService) private agcDbAccessService: AgcDbAccessService,
        @inject(TOKENS.TopicStatusService) private topicStatusService: TopicStatusService
    ) {}

    public async getLatestTopics(params: GetLatestTopicsParams): Promise<LatestTopicsResponse> {
        const groupId = params.groupId && params.groupId.length > 0 ? params.groupId : undefined;
        const searchText = params.search.trim().toLowerCase();
        const [readTopicIds, favoriteTopicIds] = await Promise.all([
            params.filterRead ? this.topicStatusService.getReadTopicIds() : Promise.resolve(undefined),
            params.filterFavorite ? this.topicStatusService.getFavoriteTopicIds() : Promise.resolve(undefined)
        ]);
        const pageResult = await this.agcDbAccessService.getLatestTopicRecordsPageByTimeRange({
            timeStart: params.timeStart,
            timeEnd: params.timeEnd,
            page: params.page,
            pageSize: params.pageSize,
            groupId,
            searchText,
            sortByInterest: params.sortByInterest,
            excludeTopicIds: readTopicIds,
            includeTopicIds: favoriteTopicIds
        });
        const pageRecords = pageResult.records;
        const pageTopicIds = pageRecords.map(record => record.topicId);
        const [readStatus, favoriteStatus] = await Promise.all([
            params.filterRead
                ? Promise.resolve(this._constantStatus(pageTopicIds, false))
                : this.topicStatusService.checkReadStatus(pageTopicIds),
            params.filterFavorite
                ? Promise.resolve(this._constantStatus(pageTopicIds, true))
                : this.topicStatusService.checkFavoriteStatus(pageTopicIds)
        ]);

        return {
            topics: pageRecords.map(record => this._toLatestTopicItem(record)),
            total: pageResult.total,
            page: params.page,
            pageSize: params.pageSize,
            readStatus,
            favoriteStatus,
            interestScores: this._toInterestScoreMap(pageRecords)
        };
    }

    private _constantStatus(topicIds: string[], value: boolean): Record<string, boolean> {
        const result: Record<string, boolean> = {};

        for (const topicId of topicIds) {
            result[topicId] = value;
        }

        return result;
    }

    private _toInterestScoreMap(records: LatestTopicRecord[]): Record<string, number> {
        const result: Record<string, number> = {};

        for (const record of records) {
            if (typeof record.interestScore === "number") {
                result[record.topicId] = record.interestScore;
            }
        }

        return result;
    }

    private _toLatestTopicItem(record: LatestTopicRecord): LatestTopicItem {
        return {
            topicId: record.topicId,
            sessionId: record.sessionId,
            topic: record.topic,
            contributors: record.contributors,
            detail: record.detail,
            modelName: record.modelName,
            updateTime: record.updateTime,
            timeStart: record.timeStart,
            timeEnd: record.timeEnd,
            groupId: record.groupId
        };
    }
}
