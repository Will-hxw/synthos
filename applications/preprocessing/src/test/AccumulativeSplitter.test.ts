import "reflect-metadata";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { KVStore } from "@root/common/util/KVStore";

const { mockGetRandomHash } = vi.hoisted(() => ({
    mockGetRandomHash: vi.fn()
}));

vi.mock("@root/common/util/math/getRandomHash", () => ({
    default: mockGetRandomHash
}));

import { AccumulativeSplitter } from "../splitters/AccumulativeSplitter";

describe("AccumulativeSplitter", () => {
    const tempRoots: string[] = [];

    afterEach(async () => {
        vi.clearAllMocks();

        for (const tempRoot of tempRoots.splice(0)) {
            await rm(tempRoot, { recursive: true, force: true });
        }
    });

    it("上一条 session 未进入摘要生命周期且容量未满时应继续复用", async () => {
        const { tempRoot, kvPath } = await createKVPath();

        tempRoots.push(tempRoot);
        await seedCapacity(kvPath, "open-session", 3);

        const currentMessage = createMessage("msg-current", undefined, "新消息");
        const splitter = createSplitter(
            kvPath,
            [createMessage("msg-prev", "open-session", "旧消息"), currentMessage],
            false
        );

        await splitter.init();
        const result = await splitter.assignSessionId("group-a", 1000, 2000);

        await splitter.dispose();

        expect(result[1].sessionId).toBe("open-session");
        expect(mockGetRandomHash).not.toHaveBeenCalled();
    });

    it("上一条 session 已进入摘要生命周期时应强制开启新 session", async () => {
        const { tempRoot, kvPath } = await createKVPath();

        tempRoots.push(tempRoot);
        await seedCapacity(kvPath, "closed-session", 3);
        mockGetRandomHash.mockReturnValue("generated-session");

        const currentMessage = createMessage("msg-current", undefined, "新消息");
        const splitter = createSplitter(
            kvPath,
            [createMessage("msg-prev", "closed-session", "旧消息"), currentMessage],
            true
        );

        await splitter.init();
        const result = await splitter.assignSessionId("group-a", 1000, 2000);

        await splitter.dispose();

        expect(result[1].sessionId).toBe("generated-session");
        expect(mockGetRandomHash).toHaveBeenCalledOnce();
    });

    it("上一条 session 容量已满时仍应开启新 session", async () => {
        const { tempRoot, kvPath } = await createKVPath();

        tempRoots.push(tempRoot);
        await seedCapacity(kvPath, "full-session", 20);
        mockGetRandomHash.mockReturnValue("generated-full-session");

        const currentMessage = createMessage("msg-current", undefined, "新消息");
        const splitter = createSplitter(
            kvPath,
            [createMessage("msg-prev", "full-session", "旧消息"), currentMessage],
            false
        );

        await splitter.init();
        const result = await splitter.assignSessionId("group-a", 1000, 2000);

        await splitter.dispose();

        expect(result[1].sessionId).toBe("generated-full-session");
        expect(mockGetRandomHash).toHaveBeenCalledOnce();
    });
});

async function createKVPath(): Promise<{ tempRoot: string; kvPath: string }> {
    const tempRoot = await mkdtemp(join(tmpdir(), "synthos-accumulative-splitter-"));

    return {
        tempRoot,
        kvPath: join(tempRoot, "kv")
    };
}

async function seedCapacity(kvPath: string, sessionId: string, capacity: number): Promise<void> {
    const kvStore = new KVStore<number>(kvPath);

    await kvStore.put(sessionId, capacity);
    await kvStore.dispose();
}

function createSplitter(kvPath: string, messages: any[], processed: boolean): AccumulativeSplitter {
    const mockConfigManagerService = {
        getCurrentConfig: vi.fn().mockResolvedValue({
            preprocessors: {
                AccumulativeSplitter: {
                    mode: "charCount",
                    maxCharCount: 20,
                    maxMessageCount: 100,
                    persistentKVStorePath: kvPath
                }
            }
        })
    };
    const mockImDbAccessService = {
        init: vi.fn().mockResolvedValue(undefined),
        getProcessedChatMessageWithRawMessageByGroupIdAndTimeRange: vi.fn().mockResolvedValue(messages)
    };
    const mockAgcDbAccessService = {
        isSessionIdProcessed: vi.fn().mockResolvedValue(processed)
    };

    return new AccumulativeSplitter(
        mockConfigManagerService as any,
        mockImDbAccessService as any,
        mockAgcDbAccessService as any
    );
}

function createMessage(msgId: string, sessionId: string | undefined, messageContent: string) {
    return {
        msgId,
        messageContent,
        groupId: "group-a",
        timestamp: 1000,
        senderId: "sender",
        senderGroupNickname: "发送者",
        senderNickname: "发送者",
        sessionId,
        preProcessedContent: ""
    };
}
