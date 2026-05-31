export class EmbeddingPromptStore {
    /**
     * RAG 检索的查询侧嵌入文本。
     *
     * 配置的嵌入模型是 bge-m3，属对称检索模型：官方用法是 query 与 passage
     * 都用裸文本、不加任何指令前缀。passage 索引侧（GenerateEmbedding）存的也是
     * `${topic} ${detail}` 裸文本，故查询侧必须同样用裸文本，两侧表示空间才一致。
     *
     * 不要在此加 "Instruct: ... Query:" 这类指令前缀——那是 e5-instruct /
     * Qwen3-Embedding 等指令式模型的用法，用在 bge-m3 上会让查询向量偏移、拉低召回。
     */
    public static getEmbeddingPromptForRAG(userQuestion: string) {
        return userQuestion;
    }

    public static getEmbeddingPromptForInterestScore(userQuery: string) {
        return `Instruct: Given a user interest keyword or phrase, retrieve relevant passages that match this interest topic.\nQuery: ${userQuery}`;
    }
}
