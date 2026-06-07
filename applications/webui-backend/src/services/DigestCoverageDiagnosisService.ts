/**
 * 摘要覆盖诊断服务
 */
import { injectable, inject } from "tsyringe";
import {
    ImDbAccessService,
    DigestCoverageSessionStats,
    DigestCoverageUnassignedMessageSample
} from "@root/common/services/database/ImDbAccessService";
import {
    AIDIGEST_SESSION_STALE_MS,
    AIDIGEST_SESSION_STATUSES
} from "@root/common/services/database/constants/AIDigestSessionConstants";

import { TOKENS } from "../di/tokens";

export interface DigestCoverageDiagnosisParams {
    groupId: string;
    timeStart: number;
    timeEnd: number;
    detailLimit: number;
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

export interface DigestCoverageUnassignedMessages {
    count: number;
    timeStart: number | null;
    timeEnd: number | null;
    items: DigestCoverageUnassignedMessageSample[];
}

export interface DigestCoverageDiagnosisResult {
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
    unassignedMessages: DigestCoverageUnassignedMessages;
    pendingSessions: DigestCoverageSessionCategory;
    recentFailedSessions: DigestCoverageSessionCategory;
    staleSessions: DigestCoverageSessionCategory;
}

@injectable()
export class DigestCoverageDiagnosisService {
    public constructor(@inject(TOKENS.ImDbAccessService) private imDbAccessService: ImDbAccessService) {}

    /**
     * 按群组和时间范围诊断消息到摘要结果的覆盖情况。
     * @param params 诊断参数
     * @returns 只读覆盖诊断结果
     */
    public async getDigestCoverage(params: DigestCoverageDiagnosisParams): Promise<DigestCoverageDiagnosisResult> {
        const now = Date.now();
        const staleBefore = now - AIDIGEST_SESSION_STALE_MS;
        const snapshot = await this.imDbAccessService.getDigestCoverageSnapshotByGroupIdAndTimeRange(
            params.groupId,
            params.timeStart,
            params.timeEnd,
            params.detailLimit
        );
        const pendingSessions: DigestCoverageSessionStats[] = [];
        const recentFailedSessions: DigestCoverageSessionStats[] = [];
        const staleSessions: DigestCoverageSessionStats[] = [];
        let coveredCount = 0;
        let recentProcessingCount = 0;

        for (const session of snapshot.sessions) {
            if (this._isCovered(session)) {
                coveredCount++;
                continue;
            }

            if (session.status === AIDIGEST_SESSION_STATUSES.failed) {
                if (typeof session.updateTime === "number" && session.updateTime >= staleBefore) {
                    recentFailedSessions.push(session);
                } else {
                    staleSessions.push(session);
                }
                continue;
            }

            if (session.status === AIDIGEST_SESSION_STATUSES.processing) {
                const lockTime = session.processingStartedAt ?? session.updateTime;

                if (typeof lockTime === "number" && lockTime >= staleBefore) {
                    recentProcessingCount++;
                } else {
                    staleSessions.push(session);
                }
                continue;
            }

            pendingSessions.push(session);
        }

        return {
            generatedAt: now,
            groupId: params.groupId,
            timeStart: params.timeStart,
            timeEnd: params.timeEnd,
            staleWindowMs: AIDIGEST_SESSION_STALE_MS,
            staleBefore,
            detailLimit: params.detailLimit,
            rawMessages: {
                totalCount: snapshot.rawMessageStats.messageCount,
                assignedCount: snapshot.rawMessageStats.assignedMessageCount,
                unassignedCount: snapshot.rawMessageStats.unassignedMessageCount,
                timeStart: snapshot.rawMessageStats.timeStart,
                timeEnd: snapshot.rawMessageStats.timeEnd
            },
            sessions: {
                totalCount: snapshot.sessions.length,
                coveredCount,
                pendingCount: pendingSessions.length,
                recentFailedCount: recentFailedSessions.length,
                staleCount: staleSessions.length,
                recentProcessingCount
            },
            unassignedMessages: {
                count: snapshot.rawMessageStats.unassignedMessageCount,
                timeStart: snapshot.rawMessageStats.unassignedTimeStart,
                timeEnd: snapshot.rawMessageStats.unassignedTimeEnd,
                items: snapshot.unassignedMessageSamples
            },
            pendingSessions: this._toCategory(pendingSessions, params.detailLimit),
            recentFailedSessions: this._toCategory(recentFailedSessions, params.detailLimit),
            staleSessions: this._toCategory(staleSessions, params.detailLimit)
        };
    }

    private _isCovered(session: DigestCoverageSessionStats): boolean {
        return (
            session.status === AIDIGEST_SESSION_STATUSES.success ||
            session.status === AIDIGEST_SESSION_STATUSES.empty ||
            session.resultTopicCount > 0
        );
    }

    private _toCategory(
        sessions: DigestCoverageSessionStats[],
        detailLimit: number
    ): DigestCoverageSessionCategory {
        return {
            count: sessions.length,
            items: sessions.slice(0, detailLimit).map(session => this._toDetail(session))
        };
    }

    private _toDetail(session: DigestCoverageSessionStats): DigestCoverageSessionDetail {
        return {
            sessionId: session.sessionId,
            messageCount: session.messageCount,
            timeStart: session.timeStart,
            timeEnd: session.timeEnd,
            status: session.status,
            updateTime: session.updateTime,
            processingStartedAt: session.processingStartedAt,
            failReason: session.failReason,
            topicCount: session.resultTopicCount
        };
    }
}
