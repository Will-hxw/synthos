import { describe, expect, it } from "vitest";

import { EmbeddingPromptStore } from "../context/prompts/EmbeddingPromptStore";

describe("EmbeddingPromptStore.getEmbeddingPromptForRAG", () => {
    it("查询侧应返回裸文本，与 bge-m3 对称检索的 passage 索引保持一致", () => {
        const query = "什么是向量数据库";

        // passage 索引侧存的是 `${topic} ${detail}` 裸文本，查询侧必须同样不加前缀
        expect(EmbeddingPromptStore.getEmbeddingPromptForRAG(query)).toBe(query);
    });

    it("不应再注入 Instruct/Query 指令前缀", () => {
        const result = EmbeddingPromptStore.getEmbeddingPromptForRAG("测试");

        expect(result).not.toContain("Instruct:");
        expect(result).not.toContain("Query:");
    });
});
