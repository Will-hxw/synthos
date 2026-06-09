import { Disposable } from "@root/common/util/lifecycle/Disposable";
import Logger from "@root/common/util/Logger";
import { mustInitBeforeUse } from "@root/common/util/lifecycle/mustInitBeforeUse";
import { container } from "tsyringe";

import { AI_MODEL_TOKENS } from "../../../di/tokens";

import { JsonFailureDiagnosticContext, TextGeneratorService } from "./TextGeneratorService";

/**
 * 池化任务定义
 */
export interface PooledTask<TContext> {
    /** 输入文本 */
    input: string;
    /** 候选模型列表（每个任务可以不同） */
    modelNames: string[];
    /** 是否强行检查JSON格式 */
    checkJsonFormat?: boolean;
    /** JSON 失败诊断上下文，用于落盘定位任务来源 */
    diagnosticContext?: JsonFailureDiagnosticContext;
    /** 调用方自定义的上下文（用于回调时识别任务） */
    context: TContext;
}

/**
 * 池化任务结果
 */
export interface PooledTaskResult<TContext> {
    isSuccess: boolean;
    selectedModelName?: string;
    content?: string;
    error?: unknown;
    /** 原样返回调用方提供的上下文 */
    context: TContext;
}

/**
 * 支持控制并发数的文本生成器池
 * 提供并发控制的文本生成能力
 */
@mustInitBeforeUse
export class PooledTextGeneratorService extends Disposable {
    private readonly maxConcurrency: number;
    private readonly taskQueue: Array<{
        task: () => Promise<void>;
        resolve: () => void;
        /** 任务在执行前被取消（如 dispose）时调用，用于写入失败结果/触发回调，避免静默缺口 */
        onCancel: () => void | Promise<void>;
    }> = [];

    private runningTasks = 0;
    private TextGeneratorService: TextGeneratorService | null = null;

    private readonly semaphoreQueue: Array<() => void> = [];
    private readonly LOGGER = Logger.withTag("PooledTextGeneratorService");
    /**
     * 构造函数
     * @param maxConcurrency 最大并发数
     */
    constructor(maxConcurrency: number) {
        super();
        if (maxConcurrency <= 0) {
            throw new Error("maxConcurrency must be greater than 0");
        }
        this.maxConcurrency = maxConcurrency;
    }

    /**
     * 初始化池化文本生成器
     */
    public async init(): Promise<void> {
        // 从 DI 容器获取已初始化的 TextGeneratorService
        this.TextGeneratorService = container.resolve<TextGeneratorService>(AI_MODEL_TOKENS.TextGeneratorService);
        this._registerDisposableFunction(async () => {
            // 清空等待中的任务：先为每个未启动任务写入“已取消”失败结果并触发回调，
            // 再 resolve 其 Promise。否则调用方按完成计数收集结果时会留下静默的 null 缺口。
            const pending = this.taskQueue.splice(0, this.taskQueue.length);

            this.semaphoreQueue.length = 0;

            for (const { onCancel, resolve } of pending) {
                try {
                    await onCancel();
                } catch (cancelError) {
                    this.LOGGER.error(
                        `任务取消处理失败: ${cancelError instanceof Error ? cancelError.message : String(cancelError)}`
                    );
                } finally {
                    resolve();
                }
            }
        });
    }

    /**
     * 信号量：尝试获取一个执行槽位
     */
    private async acquireSlot(): Promise<void> {
        if (this.runningTasks < this.maxConcurrency) {
            this.runningTasks++;

            return;
        }

        // 等待槽位释放
        return new Promise<void>(resolve => {
            this.semaphoreQueue.push(resolve);
        });
    }

    /**
     * 释放一个执行槽位，并唤醒等待者（如有）
     */
    private releaseSlot(): void {
        this.runningTasks--;
        const next = this.semaphoreQueue.shift();

        if (next) {
            this.runningTasks++; // 立即分配槽位
            next();
        }
    }

    /**
     * 执行单个任务（含错误处理和调度）
     */
    private async executeTask(task: () => Promise<void>): Promise<void> {
        try {
            await task();
        } catch (error) {
            this.LOGGER.error("Task failed unexpectedly: " + error);
        } finally {
            this.releaseSlot();
            // 尝试调度下一个任务
            this.processQueue();
        }
    }

    /**
     * 调度队列中的下一个任务（如果还有槽位）
     */
    private processQueue(): void {
        if (this.runningTasks >= this.maxConcurrency) {
            return; // 没有空闲槽位
        }

        const queued = this.taskQueue.shift();

        if (!queued) {
            return; // 队列为空
        }

        this.acquireSlot().then(() => {
            // 注意：acquireSlot 已分配槽位，executeTask 会负责 release
            this.executeTask(queued.task).then(queued.resolve);
        });
    }

    /**
     * 提交任务并在每个任务完成时回调
     * @param tasks 任务列表，每个任务可以携带自定义上下文和独立的模型候选列表
     * @param onTaskComplete 每个任务完成时的回调函数
     */
    public async submitTasks<TContext>(
        tasks: PooledTask<TContext>[],
        onTaskComplete: (result: PooledTaskResult<TContext>) => void | Promise<void>
    ): Promise<void> {
        const taskPromises: Promise<void>[] = [];

        for (const taskDef of tasks) {
            taskPromises.push(
                new Promise<void>(resolve => {
                    // 统一的回调派发：成功/失败/取消都经此触发一次 onTaskComplete。
                    const emitResult = async (result: PooledTaskResult<TContext>) => {
                        try {
                            await onTaskComplete(result);
                        } catch (callbackError) {
                            this.LOGGER.error(
                                `回调函数执行失败: ${callbackError instanceof Error ? callbackError.message : String(callbackError)}`
                            );
                        }
                    };

                    const task = async () => {
                        let result: PooledTaskResult<TContext>;

                        try {
                            const generatedResult =
                                await this.TextGeneratorService!.generateTextWithModelCandidates(
                                    taskDef.modelNames,
                                    taskDef.input,
                                    taskDef.checkJsonFormat,
                                    taskDef.diagnosticContext
                                );

                            result = {
                                isSuccess: true,
                                selectedModelName: generatedResult.selectedModelName,
                                content: generatedResult.content,
                                context: taskDef.context
                            };
                        } catch (error) {
                            this.LOGGER.warning(
                                `任务失败: ${error instanceof Error ? error.message : String(error)}`
                            );
                            result = {
                                isSuccess: false,
                                error,
                                context: taskDef.context
                            };
                        }

                        // 立即回调
                        await emitResult(result);
                    };

                    // 被取消时同样回调一次失败结果，避免调用方按完成计数收集时出现缺口。
                    const onCancel = () =>
                        emitResult({
                            isSuccess: false,
                            error: new Error("任务在执行前被取消（服务已释放）"),
                            context: taskDef.context
                        });

                    this.taskQueue.push({ task, resolve, onCancel });
                    // 仅在加入任务后尝试调度一次（安全且必要）
                    this.processQueue();
                })
            );
        }

        await Promise.all(taskPromises);
    }

    /**
     * 生成文本（带并发控制）
     * @param modelNames 候选模型列表（每个 input 都使用相同的候选列表）
     * @param inputs 输入文本列表
     * @returns 按输入顺序对应的结果数组
     */
    public async generateTextWithModelCandidates(
        modelNames: string[],
        inputs: string[]
    ): Promise<
        Array<{
            isSuccess: boolean;
            selectedModelName?: string;
            content?: string;
            error?: unknown;
            inputIndex: number;
        }>
    > {
        const results = new Array(inputs.length).fill(null); // 避免稀疏数组
        const taskPromises: Promise<void>[] = [];

        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            const inputIndex = i;

            taskPromises.push(
                new Promise<void>(resolve => {
                    const task = async () => {
                        try {
                            const result = await this.TextGeneratorService!.generateTextWithModelCandidates(
                                modelNames,
                                input
                            );

                            results[inputIndex] = {
                                isSuccess: true,
                                selectedModelName: result.selectedModelName,
                                content: result.content,
                                inputIndex
                            };
                        } catch (error) {
                            this.LOGGER.warning(
                                `Input[${inputIndex}] failed: ${error instanceof Error ? error.message : String(error)}`
                            );
                            results[inputIndex] = {
                                isSuccess: false,
                                error,
                                inputIndex
                            };
                        }
                    };

                    this.taskQueue.push({
                        task,
                        resolve,
                        // 被取消时写入失败结果，避免该输入对应的槽位残留 null。
                        onCancel: () => {
                            results[inputIndex] = {
                                isSuccess: false,
                                error: new Error("任务在执行前被取消（服务已释放）"),
                                inputIndex
                            };
                        }
                    });
                    // 仅在加入任务后尝试调度一次（安全且必要）
                    this.processQueue();
                })
            );
        }

        await Promise.all(taskPromises);

        return results;
    }
}
