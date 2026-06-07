import "reflect-metadata";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SystemMonitorService } from "../services/SystemMonitorService";

describe("SystemMonitorService", () => {
    const createdServices: SystemMonitorService[] = [];

    const createService = (ragClient: unknown): SystemMonitorService => {
        const service = new SystemMonitorService(ragClient as any);

        createdServices.push(service);

        return service;
    };

    afterEach(() => {
        for (const service of createdServices) {
            clearInterval((service as any).collectionInterval);
        }
        createdServices.length = 0;
        vi.clearAllMocks();
    });

    it("应透出 ai-model runtime 状态", async () => {
        const service = createService({
            runtimeStatus: {
                query: vi.fn().mockResolvedValue({
                    model: "bge-m3",
                    ollamaReachable: true,
                    modelInstalled: true,
                    vectorTopicCount: 12,
                    checkedAt: 1000
                })
            }
        });

        const runtime = await (service as any)._getRuntimeStats();

        expect(runtime).toEqual({
            aiModelReachable: true,
            embedding: {
                model: "bge-m3",
                ollamaReachable: true,
                modelInstalled: true,
                vectorTopicCount: 12,
                checkedAt: 1000
            }
        });
    });

    it("应缓存 runtime 状态，避免每秒触发 Ollama 可用性检查", async () => {
        const runtimeStatusQuery = vi.fn().mockResolvedValue({
            model: "bge-m3",
            ollamaReachable: true,
            modelInstalled: true,
            vectorTopicCount: 12,
            checkedAt: 1000
        });
        const service = createService({
            runtimeStatus: {
                query: runtimeStatusQuery
            }
        });

        await (service as any)._getRuntimeStats();
        await (service as any)._getRuntimeStats();

        expect(runtimeStatusQuery).toHaveBeenCalledTimes(1);
    });

    it("ai-model 不可达时应返回降级状态", async () => {
        const service = createService({
            runtimeStatus: {
                query: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"))
            }
        });

        const runtime = await (service as any)._getRuntimeStats();

        expect(runtime).toEqual({
            aiModelReachable: false,
            embedding: null,
            error: "connect ECONNREFUSED"
        });
    });
});
