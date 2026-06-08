import "reflect-metadata";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { container } from "tsyringe";
import { COMMON_TOKENS } from "@root/common/di/tokens";
import { registerAgcDbAccessService, registerImDbAccessService } from "@root/common/di/container";

import {
    getAccumulativeSplitter,
    getTimeoutSplitter,
    registerAccumulativeSplitter,
    registerTimeoutSplitter
} from "../di/container";

describe("preprocessing DI 容器", () => {
    const tempRoots: string[] = [];

    beforeEach(() => {
        container.reset();
    });

    afterEach(async () => {
        container.reset();
        vi.clearAllMocks();

        for (const tempRoot of tempRoots.splice(0)) {
            await rm(tempRoot, { recursive: true, force: true });
        }
    });

    it("AccumulativeSplitter 应使用已注册的 AgcDbAccessService 实例", async () => {
        const { tempRoot, kvPath } = await createKVPath();

        tempRoots.push(tempRoot);
        const mockAgcDbAccessService = createAgcDbAccessService(true);

        registerCommonMocks(kvPath, mockAgcDbAccessService);
        registerAccumulativeSplitter();

        const splitter = getAccumulativeSplitter();

        await splitter.init();
        const reusable = await (splitter as any)._canReuseSession("closed-session", new Map());

        await splitter.dispose();

        expect(reusable).toBe(false);
        expect((splitter as any).agcDbAccessService).toBe(mockAgcDbAccessService);
        expect(mockAgcDbAccessService.isSessionIdProcessed).toHaveBeenCalledWith("closed-session");
    });

    it("TimeoutSplitter 应使用已注册的 AgcDbAccessService 实例", async () => {
        const { tempRoot, kvPath } = await createKVPath();

        tempRoots.push(tempRoot);
        const mockAgcDbAccessService = createAgcDbAccessService(false);

        registerCommonMocks(kvPath, mockAgcDbAccessService);
        registerTimeoutSplitter();

        const splitter = getTimeoutSplitter();

        await splitter.init();
        const reusable = await (splitter as any)._canReuseSession("open-session", new Map());

        expect(reusable).toBe(true);
        expect((splitter as any).agcDbAccessService).toBe(mockAgcDbAccessService);
        expect(mockAgcDbAccessService.isSessionIdProcessed).toHaveBeenCalledWith("open-session");
    });
});

async function createKVPath(): Promise<{ tempRoot: string; kvPath: string }> {
    const tempRoot = await mkdtemp(join(tmpdir(), "synthos-preprocessing-container-"));

    return {
        tempRoot,
        kvPath: join(tempRoot, "kv")
    };
}

function registerCommonMocks(kvPath: string, mockAgcDbAccessService: any): void {
    container.registerInstance(COMMON_TOKENS.ConfigManagerService, {
        getCurrentConfig: vi.fn().mockResolvedValue({
            preprocessors: {
                AccumulativeSplitter: {
                    mode: "charCount",
                    maxCharCount: 20,
                    maxMessageCount: 100,
                    persistentKVStorePath: kvPath
                },
                TimeoutSplitter: {
                    timeoutInMinutes: 10
                }
            }
        })
    } as any);
    registerImDbAccessService({
        init: vi.fn().mockResolvedValue(undefined),
        getProcessedChatMessageWithRawMessageByGroupIdAndTimeRange: vi.fn().mockResolvedValue([])
    } as any);
    registerAgcDbAccessService(mockAgcDbAccessService as any);
}

function createAgcDbAccessService(processed: boolean) {
    return {
        isSessionIdProcessed: vi.fn().mockResolvedValue(processed)
    };
}
