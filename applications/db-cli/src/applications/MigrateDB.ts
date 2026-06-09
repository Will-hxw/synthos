import * as fs from "fs/promises";

import { ImDbAccessService } from "@root/common/services/database/ImDbAccessService";
import { AgcDbAccessService } from "@root/common/services/database/AgcDbAccessService";
import { InterestScoreDbAccessService } from "@root/common/services/database/InterestScoreDbAccessService";
import {
    createIMDBTableSQL,
    createAGCTableSQL,
    createInterestScoreTableSQL
} from "@root/common/services/database/constants/InitialSQL";
import { PromisifiedSQLite } from "@root/common/util/promisify/PromisifiedSQLite";
import sqlite3 from "sqlite3";
import Logger from "@root/common/util/Logger";
import { Disposable } from "@root/common/util/lifecycle/Disposable";
import { mustInitBeforeUse } from "@root/common/util/lifecycle/mustInitBeforeUse";

import { IApplication } from "@/contracts/IApplication";

const MIGRATE_TARGET_DB = "migrated_database.db";
/** 分页迁移批大小：避免一次性把整张大表载入内存 */
const MIGRATE_PAGE_SIZE = 2000;

@mustInitBeforeUse
export class MigrateDB extends Disposable implements IApplication {
    public static readonly appName = "数据库迁移";
    public static readonly description = "将旧数据库迁移到新的统一数据库文件";

    private LOGGER = Logger.withTag("数据库迁移任务");
    private imdbDBManager: ImDbAccessService = this._registerDisposable(new ImDbAccessService());
    private agcDbAccessService: AgcDbAccessService = this._registerDisposable(new AgcDbAccessService());
    private interestScoreDbAccessService: InterestScoreDbAccessService = this._registerDisposable(
        new InterestScoreDbAccessService()
    );

    public async init() {
        await this.imdbDBManager.init();
        await this.agcDbAccessService.init();
        await this.interestScoreDbAccessService.init();

        this.LOGGER.info("初始化完成！");
    }

    public async run() {
        // 目标文件已存在时直接中止：避免对历史残留或半成品文件重复写入造成数据混淆。
        // 若需重新迁移，请先手动删除该文件。
        if (await this._targetExists(MIGRATE_TARGET_DB)) {
            throw new Error(`目标文件 ${MIGRATE_TARGET_DB} 已存在，为避免覆盖或污染请先手动删除后重试。`);
        }

        const newDB = new PromisifiedSQLite(sqlite3);

        try {
            await newDB.open(MIGRATE_TARGET_DB);
            this.LOGGER.success(`已创建新的数据库文件 ${MIGRATE_TARGET_DB}`);

            // pragma 设置
            await newDB.run("PRAGMA journal_mode = WAL;");
            await newDB.run("PRAGMA synchronous = NORMAL;");
            await newDB.run("PRAGMA temp_store = MEMORY;");
            await newDB.run("PRAGMA cache_size = -100000;"); // 约 100MB
            await newDB.run("PRAGMA threads = 16;"); // 多线程

            // 创建表结构：复用 InitialSQL 中的完整建表语句，确保与生产库 schema 一致，
            // 不再使用残缺的内联 SQL（此前会丢失 ai_digest_sessions 表及部分索引）。
            this.LOGGER.info("创建表结构...");
            await newDB.exec(createIMDBTableSQL);
            await newDB.exec(createAGCTableSQL);
            await newDB.exec(createInterestScoreTableSQL);
            this.LOGGER.info("创建表结构成功");

            await this._migrateImdbMessages(newDB);
            await this._migrateImdbMedia(newDB);
            await this._migrateAgcResults(newDB);
            await this._migrateAgcSessions(newDB);
            await this._migrateInterestScores(newDB);

            this.LOGGER.success("数据库迁移完成");
        } finally {
            // 无论迁移过程中途是否抛错，都必须关闭目标库连接，避免连接与 WAL 句柄泄漏。
            await newDB.dispose();
            this.LOGGER.success("已关闭目标数据库连接");
        }
    }

    private async _targetExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);

            return true;
        } catch {
            return false;
        }
    }

    /**
     * 通用分页迁移：在一个事务内写完一页，逐页推进，避免一次性载入整表。
     * @param label 日志标签
     * @param newDB 目标库连接
     * @param fetchPage 按 (limit, offset) 拉取一页源数据
     * @param insertRow 写入单行
     */
    private async _migratePaged<T>(
        label: string,
        newDB: PromisifiedSQLite,
        fetchPage: (limit: number, offset: number) => Promise<T[]>,
        insertRow: (row: T) => Promise<void>
    ): Promise<number> {
        let offset = 0;
        let total = 0;

        while (true) {
            const rows = await fetchPage(MIGRATE_PAGE_SIZE, offset);

            if (rows.length === 0) {
                break;
            }

            await newDB.run(`BEGIN IMMEDIATE TRANSACTION`);
            try {
                for (const row of rows) {
                    await insertRow(row);
                }
                await newDB.run(`COMMIT`);
            } catch (error) {
                await newDB.run(`ROLLBACK`);
                throw error;
            }

            total += rows.length;
            offset += rows.length;
            this.LOGGER.info(`${label}：已迁移 ${total} 条`);

            if (rows.length < MIGRATE_PAGE_SIZE) {
                break;
            }
        }

        return total;
    }

    private async _migrateImdbMessages(newDB: PromisifiedSQLite): Promise<void> {
        this.LOGGER.info("开始迁移 IMDB 消息数据...");
        const total = await this._migratePaged(
            "IMDB 消息",
            newDB,
            (limit, offset) => this.imdbDBManager.selectChatMessagesPaged(limit, offset),
            data =>
                newDB.run(
                    `INSERT INTO chat_messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(msgId) DO NOTHING`,
                    [
                        data.msgId,
                        data.messageContent,
                        data.groupId,
                        data.timestamp,
                        data.senderId,
                        data.senderGroupNickname,
                        data.senderNickname,
                        data.quotedMsgId,
                        data.quotedMsgContent,
                        data.sessionId,
                        data.preProcessedContent
                    ]
                )
        );

        this.LOGGER.success(`已迁移 IMDB 消息数据，共 ${total} 条`);
    }

    private async _migrateImdbMedia(newDB: PromisifiedSQLite): Promise<void> {
        this.LOGGER.info("开始迁移 IMDB 媒体数据...");
        const total = await this._migratePaged(
            "IMDB 媒体",
            newDB,
            (limit, offset) => this.imdbDBManager.selectChatMessageMediaPaged(limit, offset),
            data =>
                newDB.run(
                    `INSERT INTO chat_message_media (
                        mediaId, msgId, groupId, timestamp, elementIndex, mediaType, sourceProvider,
                        sourceUrl, sourcePath, fileName, fileSize, duration,
                        width, height, picType, originImageMd5, qqImageText,
                        ocrText, visionDescription, imageCategory, understandingText,
                        transcript, status, retryCount, failReason, ocrEngine, modelName, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(mediaId) DO NOTHING`,
                    [
                        data.mediaId,
                        data.msgId,
                        data.groupId,
                        data.timestamp,
                        data.elementIndex,
                        data.mediaType,
                        data.sourceProvider,
                        data.sourceUrl,
                        data.sourcePath,
                        data.fileName,
                        data.fileSize,
                        data.duration,
                        data.width,
                        data.height,
                        data.picType,
                        data.originImageMd5,
                        data.qqImageText,
                        data.ocrText,
                        data.visionDescription,
                        data.imageCategory,
                        data.understandingText,
                        data.transcript,
                        data.status,
                        data.retryCount,
                        data.failReason,
                        data.ocrEngine,
                        data.modelName,
                        data.createdAt,
                        data.updatedAt
                    ]
                )
        );

        this.LOGGER.success(`已迁移 IMDB 媒体数据，共 ${total} 条`);
    }

    private async _migrateAgcResults(newDB: PromisifiedSQLite): Promise<void> {
        this.LOGGER.info("开始迁移 AGC 摘要结果...");
        const total = await this._migratePaged(
            "AGC 摘要结果",
            newDB,
            (limit, offset) => this.agcDbAccessService.selectAllResultsPaged(limit, offset),
            data =>
                newDB.run(
                    `INSERT INTO ai_digest_results VALUES (?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(topicId) DO NOTHING`,
                    [
                        data.topicId,
                        data.sessionId,
                        data.topic,
                        data.contributors,
                        data.detail,
                        data.modelName,
                        data.updateTime
                    ]
                )
        );

        this.LOGGER.success(`已迁移 AGC 摘要结果，共 ${total} 条`);
    }

    private async _migrateAgcSessions(newDB: PromisifiedSQLite): Promise<void> {
        this.LOGGER.info("开始迁移 AGC 摘要会话...");
        const total = await this._migratePaged(
            "AGC 摘要会话",
            newDB,
            (limit, offset) => this.agcDbAccessService.selectAllSessions(limit, offset),
            data =>
                newDB.run(
                    `INSERT INTO ai_digest_sessions (
                        sessionId, status, topicCount, updateTime, processingStartedAt,
                        failReason, messageCount, timeStart, timeEnd
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(sessionId) DO NOTHING`,
                    [
                        data.sessionId,
                        data.status,
                        data.topicCount,
                        data.updateTime,
                        data.processingStartedAt,
                        data.failReason,
                        data.messageCount,
                        data.timeStart,
                        data.timeEnd
                    ]
                )
        );

        this.LOGGER.success(`已迁移 AGC 摘要会话，共 ${total} 条`);
    }

    private async _migrateInterestScores(newDB: PromisifiedSQLite): Promise<void> {
        this.LOGGER.info("开始迁移 Interest Score 数据...");
        const total = await this._migratePaged(
            "Interest Score",
            newDB,
            (limit, offset) => this.interestScoreDbAccessService.selectAllPaged(limit, offset),
            data =>
                newDB.run(
                    `INSERT INTO interset_score_results VALUES (?, ?, ?, ?, ?, ?)
                     ON CONFLICT(topicId) DO NOTHING`,
                    [data.topicId, data.scoreV1, data.scoreV2, data.scoreV3, data.scoreV4, data.scoreV5]
                )
        );

        this.LOGGER.success(`已迁移 Interest Score 数据，共 ${total} 条`);
    }
}
