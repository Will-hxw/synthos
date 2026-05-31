import "reflect-metadata";

import { describe, expect, it, vi } from "vitest";

const { mockLogger } = vi.hoisted(() => ({
    mockLogger: {
        debug: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock("@root/common/util/Logger", () => ({
    default: {
        withTag: () => mockLogger
    }
}));

vi.mock("../context/prompts/AgentPromptStore", () => ({
    AgentPromptStore: {
        getAgentSystemPrompt: vi.fn().mockResolvedValue({
            serializeToString: () => "系统提示词"
        })
    }
}));

import { RagRPCImpl } from "../rag/RagRPCImpl";

describe("RagRPCImpl", () => {
    it("Agent流式请求取消后不应写入assistant消息", async () => {
        const abortController = new AbortController();
        const onChunk = vi.fn();
        const agentDB = {
            createConversation: vi.fn().mockResolvedValue(undefined),
            addMessage: vi.fn().mockResolvedValue(undefined),
            getMessagesByConversationId: vi.fn().mockResolvedValue([])
        };
        const agentExecutor = {
            executeStream: vi.fn().mockImplementation(async () => {
                abortController.abort();

                return {
                    content: "过期回答",
                    toolsUsed: [],
                    toolRounds: 1,
                    totalUsage: undefined
                };
            })
        };
        const agentToolCatalog = {
            getEnabledToolDefinitions: vi.fn().mockReturnValue([])
        };
        const rpcImpl = new RagRPCImpl(
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            agentExecutor as any,
            agentDB as any,
            agentToolCatalog as any
        );

        await expect(
            rpcImpl.agentAsk(
                {
                    question: "测试问题",
                    conversationId: "conversation-1"
                },
                onChunk,
                {
                    abortSignal: abortController.signal
                }
            )
        ).rejects.toThrow("执行被用户中止");

        expect(agentDB.addMessage).toHaveBeenCalledTimes(1);
        expect(agentDB.addMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                conversationId: "conversation-1",
                role: "user",
                content: "测试问题"
            })
        );
        expect(onChunk).not.toHaveBeenCalledWith(expect.objectContaining({ type: "done" }));
    });

    it("search 应批量获取话题摘要而非逐条查询", async () => {
        const embeddingService = {
            embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
        };
        const vectorDB = {
            searchSimilar: vi.fn().mockReturnValue([
                { topicId: "topic-1", distance: 0.1 },
                { topicId: "topic-2", distance: 0.2 },
                { topicId: "missing", distance: 0.3 }
            ])
        };
        const getAIDigestResultsByTopicIds = vi.fn().mockResolvedValue(
            new Map([
                ["topic-1", { topic: "话题1", detail: "详情1", contributors: "[]" }],
                ["topic-2", { topic: "话题2", detail: "详情2", contributors: "[]" }]
            ])
        );
        const agcDB = {
            getAIDigestResultsByTopicIds,
            getAIDigestResultByTopicId: vi.fn()
        };

        const rpcImpl = new RagRPCImpl(
            {} as any,
            vectorDB as any,
            agcDB as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            embeddingService as any,
            {} as any,
            {} as any,
            {} as any
        );

        const output = await rpcImpl.search({ query: "测试", limit: 10 });

        // 只调用一次批量查询，不再逐条 await
        expect(getAIDigestResultsByTopicIds).toHaveBeenCalledTimes(1);
        expect(getAIDigestResultsByTopicIds).toHaveBeenCalledWith(["topic-1", "topic-2", "missing"]);
        expect(agcDB.getAIDigestResultByTopicId).not.toHaveBeenCalled();
        // 无摘要的 topic 被过滤掉
        expect(output.map(r => r.topicId)).toEqual(["topic-1", "topic-2"]);
        expect(output[0]).toMatchObject({ topicId: "topic-1", topic: "话题1", distance: 0.1 });
    });
});
