import "reflect-metadata";
import path from "path";

import { injectable, inject } from "tsyringe";
import { TaskHandlerTypes, TaskParameters } from "@root/common/scheduler/@types/Tasks";
import { agendaInstance } from "@root/common/scheduler/agenda";
import Logger from "@root/common/util/Logger";
import { ConfigManagerService } from "@root/common/services/config/ConfigManagerService";
import { COMMON_TOKENS } from "@root/common/di/tokens";
import { ImDbAccessService, PendingChatMessageMedia } from "@root/common/services/database/ImDbAccessService";
import { GlobalConfig } from "@root/common/services/config/schemas/GlobalConfig";
import { RawChatMessage } from "@root/common/contracts/data-provider/index";
import { formatMsg } from "@root/common/util/chat/formatMsg";

import { AudioDataUrlService } from "../services/audio-transcription/AudioDataUrlService";
import { MimoAsrClient } from "../services/audio-transcription/MimoAsrClient";

interface AudioTranscriptionStats {
    processed: number;
    success: number;
    failed: number;
    skipped: number;
    totalDurationMs: number;
}

/**
 * 语音转文字任务处理器。
 * 负责把 QQ 音频媒体异步转写为摘要可消费的文本。
 */
@injectable()
export class AudioTranscriptionTaskHandler {
    private readonly LOGGER = Logger.withTag("AudioTranscriptionTask");
    private readonly audioDataUrlService = new AudioDataUrlService();
    private readonly mimoAsrClient = new MimoAsrClient();

    public constructor(
        @inject(COMMON_TOKENS.ConfigManagerService) private configManagerService: ConfigManagerService,
        @inject(COMMON_TOKENS.ImDbAccessService) private imDbAccessService: ImDbAccessService
    ) {}

    /**
     * 注册任务到 Agenda 调度器。
     */
    public async register(): Promise<void> {
        await agendaInstance
            .create(TaskHandlerTypes.AudioTranscription)
            .unique({ name: TaskHandlerTypes.AudioTranscription }, { insertOnly: true })
            .save();

        agendaInstance.define<TaskParameters<TaskHandlerTypes.AudioTranscription>>(
            TaskHandlerTypes.AudioTranscription,
            async job => {
                this.LOGGER.info(`开始处理任务: ${job.attrs.name}`);
                const attrs = job.attrs.data;
                const config = await this.configManagerService.getCurrentConfig();
                const audioTranscriptionConfig = config.ai.audioTranscription;

                if (!audioTranscriptionConfig.enabled) {
                    this.LOGGER.info("语音转文字未启用，跳过当前任务");

                    return;
                }

                if (!audioTranscriptionConfig.apiKey) {
                    this.LOGGER.warning("语音转文字配置缺少 API Key，跳过当前任务");

                    return;
                }

                const mediaItems = await this.imDbAccessService.getPendingAudioMediaByGroupIdsAndTimeRange(
                    attrs.groupIds,
                    attrs.startTimeStamp,
                    attrs.endTimeStamp,
                    audioTranscriptionConfig.batchSize
                );

                if (mediaItems.length === 0) {
                    this.LOGGER.info("没有需要语音转文字处理的新音频");

                    return;
                }

                this.LOGGER.info(`本轮准备处理 ${mediaItems.length} 条语音`);
                const stats = this._createStats();

                for (const media of mediaItems) {
                    await job.touch();
                    await this._processMedia(media, config, stats);
                }

                const averageDurationMs =
                    stats.processed === 0 ? 0 : Math.round(stats.totalDurationMs / stats.processed);

                this.LOGGER.success(
                    `语音转文字完成：处理=${stats.processed}，成功=${stats.success}，失败=${stats.failed}，跳过=${stats.skipped}，平均耗时=${averageDurationMs}ms`
                );
            },
            {
                concurrency: 1,
                priority: "high"
            }
        );
    }

    private _createStats(): AudioTranscriptionStats {
        return {
            processed: 0,
            success: 0,
            failed: 0,
            skipped: 0,
            totalDurationMs: 0
        };
    }

    private async _processMedia(
        media: PendingChatMessageMedia,
        config: GlobalConfig,
        stats: AudioTranscriptionStats
    ): Promise<void> {
        const startedAt = Date.now();
        const audioTranscriptionConfig = config.ai.audioTranscription;

        stats.processed++;

        try {
            if (media.retryCount > audioTranscriptionConfig.maxRetryCount) {
                await this.imDbAccessService.updateChatMessageMediaTranscription(media.mediaId, {
                    status: "failed",
                    failReason: "语音转文字超过最大重试次数"
                });
                stats.failed++;

                return;
            }

            if (!media.sourcePath) {
                await this.imDbAccessService.updateChatMessageMediaTranscription(media.mediaId, {
                    status: "skipped",
                    failReason: "语音缺少可定位的源文件路径"
                });
                stats.skipped++;

                return;
            }

            const audioFilePath = this._resolveQQAudioFilePath(
                config.dataProviders.QQ.dbBasePath,
                media.sourcePath
            );
            const audioDataUrl = await this.audioDataUrlService.readAsWavDataUrl(
                audioFilePath,
                audioTranscriptionConfig.maxAudioBase64Bytes
            );
            const transcript = await this.mimoAsrClient.transcribe(audioDataUrl.dataUrl, audioTranscriptionConfig);
            const messageContent = `[语音转文字：${transcript}]`;
            const preProcessedContent = await this._buildPreProcessedContent(media.msgId, messageContent);

            await this.imDbAccessService.updateAudioTranscribedMessage(
                media.mediaId,
                media.msgId,
                messageContent,
                preProcessedContent,
                {
                    status: "success",
                    transcript,
                    failReason: null,
                    modelName: audioTranscriptionConfig.model
                }
            );
            stats.success++;
        } catch (error) {
            await this._markFailedOrRetry(media, this._formatUnknownError(error), config, stats);
        } finally {
            stats.totalDurationMs += Date.now() - startedAt;
        }
    }

    private async _buildPreProcessedContent(msgId: string, messageContent: string): Promise<string | null> {
        const message = (await this.imDbAccessService.getRawChatMessageByMsgId(msgId)) as RawChatMessage & {
            sessionId?: string | null;
        };

        if (!message.sessionId) {
            return null;
        }

        const updatedMessage: RawChatMessage = {
            ...message,
            messageContent
        };
        const quotedMsg = await this._loadQuotedMessage(message);
        const mediaMsgIds = [message.msgId];

        if (quotedMsg) {
            mediaMsgIds.push(quotedMsg.msgId);
        }

        const mediaMap = await this.imDbAccessService.getChatMessageMediaByMsgIds(mediaMsgIds);

        return formatMsg(
            updatedMessage,
            quotedMsg || undefined,
            message.quotedMsgContent,
            mediaMap.get(message.msgId) || [],
            quotedMsg ? mediaMap.get(quotedMsg.msgId) || [] : []
        );
    }

    private async _loadQuotedMessage(message: RawChatMessage): Promise<RawChatMessage | null> {
        if (!message.quotedMsgId) {
            return null;
        }

        try {
            return await this.imDbAccessService.getRawChatMessageByMsgId(message.quotedMsgId);
        } catch (error) {
            this.LOGGER.warning(`语音转写重算预处理文本时未找到引用消息：${this._formatUnknownError(error)}`);

            return null;
        }
    }

    private async _markFailedOrRetry(
        media: PendingChatMessageMedia,
        failReason: string,
        config: GlobalConfig,
        stats: AudioTranscriptionStats
    ): Promise<void> {
        const nextRetryCount = media.retryCount + 1;
        const shouldRetry = nextRetryCount <= config.ai.audioTranscription.maxRetryCount;

        await this.imDbAccessService.updateChatMessageMediaTranscription(media.mediaId, {
            status: shouldRetry ? "pending" : "failed",
            failReason: this._truncateText(failReason || "语音转文字失败", 240),
            incrementRetryCount: true
        });

        if (shouldRetry) {
            this.LOGGER.warning(`语音转文字失败，等待下轮重试：mediaId=${media.mediaId}，msgId=${media.msgId}`);
        } else {
            stats.failed++;
            this.LOGGER.warning(`语音转文字最终失败：mediaId=${media.mediaId}，msgId=${media.msgId}`);
        }
    }

    private _resolveQQAudioFilePath(dbBasePath: string, sourcePath: string): string {
        const rootPath = path.dirname(path.dirname(path.dirname(path.resolve(dbBasePath))));
        const normalizedSourcePath = path.normalize(sourcePath);
        const candidatePath = path.isAbsolute(normalizedSourcePath)
            ? path.resolve(normalizedSourcePath)
            : path.resolve(rootPath, normalizedSourcePath);
        const relativePath = path.relative(rootPath, candidatePath);

        if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${path.sep}`)) {
            throw new Error("语音源文件路径超出 QQ 媒体根目录");
        }

        return candidatePath;
    }

    private _formatUnknownError(error: unknown): string {
        if (error instanceof Error) {
            return this._truncateText(error.message, 240);
        }

        return this._truncateText(String(error), 240);
    }

    private _truncateText(value: string, maxLength: number): string {
        if (value.length <= maxLength) {
            return value;
        }

        return `${value.slice(0, maxLength)}...`;
    }
}
