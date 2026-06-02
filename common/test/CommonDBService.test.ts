import "reflect-metadata";

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, describe, expect, it } from "vitest";

import { ConfigManagerService } from "../services/config/ConfigManagerService";
import { CommonDBService } from "../services/database/infra/CommonDBService";

describe("CommonDBService", () => {
    let tempDir: string | null = null;
    let service: CommonDBService | null = null;

    afterEach(async () => {
        if (service) {
            await service.dispose();
            service = null;
        }
        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true });
            tempDir = null;
        }
    });

    it("初始化主库时应启用 WAL 并设置锁等待时间", async () => {
        tempDir = await mkdtemp(join(tmpdir(), "synthos-common-db-"));
        const configManagerService = {
            getCurrentConfig: async () => ({
                commonDatabase: {
                    dbBasePath: tempDir
                }
            })
        } as unknown as ConfigManagerService;

        service = new CommonDBService(configManagerService);
        await service.init("CREATE TABLE IF NOT EXISTS smoke (id TEXT PRIMARY KEY);");

        const busyTimeout = await service.get<{ timeout: number }>("PRAGMA busy_timeout;");
        const journalMode = await service.get<{ journal_mode: string }>("PRAGMA journal_mode;");
        const smokeTable = await service.get<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type = ? AND name = ?",
            ["table", "smoke"]
        );

        expect(busyTimeout?.timeout).toBe(10_000);
        expect(journalMode?.journal_mode).toBe("wal");
        expect(smokeTable?.name).toBe("smoke");
    });
});
