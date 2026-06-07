import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RuntimeHint from "../components/runtime/RuntimeHint";

describe("RuntimeHint", () => {
    it("数据空状态应提示宿主机 data-provider 和 QQ 配置", () => {
        const html = renderToStaticMarkup(<RuntimeHint isLoading={false} mode="data" stats={null} />);

        expect(html).toContain("data-provider");
        expect(html).toContain("dbKey");
        expect(html).toContain("VFSExtPath");
    });

    it("语义搜索空状态应提示缺失的 embedding 模型和向量数量", () => {
        const html = renderToStaticMarkup(
            <RuntimeHint
                isLoading={false}
                mode="embedding"
                stats={{
                    timestamp: 1,
                    storage: {
                        chatRecordDB: { count: 0, size: 0 },
                        imMessageFtsDB: { count: 0, size: 0 },
                        aiDialogueDB: { count: 0, size: 0 },
                        vectorDB: { count: 0, size: 0 },
                        kvStoreBackend: { count: 0, size: 0 },
                        kvStorePersistent: { count: 0, size: 0 },
                        logs: { count: 0, size: 0 },
                        totalSize: 0
                    },
                    modules: {},
                    runtime: {
                        aiModelReachable: true,
                        embedding: {
                            model: "bge-m3",
                            ollamaReachable: true,
                            modelInstalled: false,
                            vectorTopicCount: 0,
                            checkedAt: 1
                        }
                    }
                }}
            />
        );

        expect(html).toContain("ollama pull bge-m3");
        expect(html).toContain("向量库 topic 数：0");
    });
});
