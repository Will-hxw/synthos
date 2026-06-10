import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    QQ_SOURCE_RECONCILE_STATUS_PREFIX,
    type QQSourceReconcileStatus
} from "@root/common/contracts/data-provider/index";

import { SetupStatusService } from "../services/SetupStatusService";

const accessMock = vi.hoisted(() => vi.fn());
const kvStoreState = vi.hoisted(() => ({
    instances: [] as Array<{
        dbPath: string;
        get: ReturnType<typeof vi.fn>;
        keys: ReturnType<typeof vi.fn>;
        dispose: ReturnType<typeof vi.fn>;
    }>,
    values: new Map<string, QQSourceReconcileStatus>()
}));

vi.mock("fs/promises", () => ({
    access: accessMock
}));

vi.mock("@root/common/util/KVStore", () => ({
    KVStore: class MockKVStore {
        public get = vi.fn(async (key: string) => kvStoreState.values.get(key));
        public keys = vi.fn(async () => Array.from(kvStoreState.values.keys()));
        public dispose = vi.fn(async () => undefined);

        public constructor(public dbPath: string) {
            kvStoreState.instances.push(this);
        }
    }
}));

describe("SetupStatusService", () => {
    beforeEach(() => {
        accessMock.mockResolvedValue(undefined);
        kvStoreState.instances.length = 0;
        kvStoreState.values.clear();
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                json: async () => ({
                    models: [{ name: "bge-m3" }]
                })
            }))
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it("读取 QQ 原库对账状态时应按已配置群组定点读取而不是扫描 keys", async () => {
        const groupAStatus = createStatus("group-a", 1000);
        const groupBStatus = createStatus("group-b", 2000);
        const orphanStatus = createStatus("orphan-group", 3000);

        kvStoreState.values.set(`${QQ_SOURCE_RECONCILE_STATUS_PREFIX}:group-a`, groupAStatus);
        kvStoreState.values.set(`${QQ_SOURCE_RECONCILE_STATUS_PREFIX}:group-b`, groupBStatus);
        kvStoreState.values.set(`${QQ_SOURCE_RECONCILE_STATUS_PREFIX}:orphan-group`, orphanStatus);
        const service = createService({
            groupConfigs: {
                "group-a": {},
                "group-b": {}
            },
            webUI_Backend: {
                kvStoreBasePath: "D:\\tmp\\synthos-kv"
            },
            ai: {
                embedding: {
                    ollamaBaseURL: "http://127.0.0.1:11434",
                    model: "bge-m3"
                }
            }
        });

        const result = await service.getSetupStatus();

        expect(kvStoreState.instances).toHaveLength(1);
        expect(kvStoreState.instances[0].keys).not.toHaveBeenCalled();
        expect(kvStoreState.instances[0].get).toHaveBeenCalledWith(`${QQ_SOURCE_RECONCILE_STATUS_PREFIX}:group-a`);
        expect(kvStoreState.instances[0].get).toHaveBeenCalledWith(`${QQ_SOURCE_RECONCILE_STATUS_PREFIX}:group-b`);
        expect(kvStoreState.instances[0].get).not.toHaveBeenCalledWith(
            `${QQ_SOURCE_RECONCILE_STATUS_PREFIX}:orphan-group`
        );
        expect(result.qqSourceReconcile).toEqual([groupBStatus, groupAStatus]);
    });
});

function createService(config: unknown): SetupStatusService {
    return new SetupStatusService({
        getCurrentConfig: vi.fn(async () => config)
    } as any);
}

function createStatus(groupId: string, updatedAt: number): QQSourceReconcileStatus {
    return {
        groupId,
        cursor: null,
        nextCursor: null,
        scannedCount: 10,
        missingCount: 1,
        insertedCount: 1,
        quoteRepairCount: 1,
        reachedEnd: false,
        wrapped: false,
        batchSize: 500,
        updatedAt
    };
}
