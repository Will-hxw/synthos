import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLevelConstructor, mockLevelInstance } = vi.hoisted(() => {
    const levelInstance = {
        put: vi.fn(),
        get: vi.fn(),
        keys: vi.fn(),
        del: vi.fn(),
        batch: vi.fn(),
        close: vi.fn()
    };

    return {
        mockLevelConstructor: vi.fn(function MockLevel() {
            return levelInstance;
        }),
        mockLevelInstance: levelInstance
    };
});

vi.mock("level", () => ({
    Level: mockLevelConstructor
}));

import { KVStore } from "../util/KVStore";

describe("KVStore", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLevelInstance.put.mockResolvedValue(undefined);
        mockLevelInstance.get.mockResolvedValue(undefined);
        mockLevelInstance.keys.mockReturnValue((async function* () {})());
        mockLevelInstance.del.mockResolvedValue(undefined);
        mockLevelInstance.batch.mockResolvedValue(undefined);
        mockLevelInstance.close.mockResolvedValue(undefined);
    });

    it("get 在 key 不存在时应返回 undefined", async () => {
        const notFoundError = Object.assign(new Error("not found"), { code: "LEVEL_NOT_FOUND" });
        const store = new KVStore("mock-location");

        mockLevelInstance.get.mockRejectedValue(notFoundError);

        await expect(store.get("missing-key")).resolves.toBeUndefined();
    });

    it("get 遇到损坏或解析错误时应继续抛出", async () => {
        const parseError = new SyntaxError("Unexpected token");
        const store = new KVStore("mock-location");

        mockLevelInstance.get.mockRejectedValue(parseError);

        await expect(store.get("broken-key")).rejects.toBe(parseError);
    });
});
