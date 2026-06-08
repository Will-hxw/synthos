import { describe, expect, it, vi } from "vitest";

import { SemanticRater } from "../misc/SemanticRater";
import { EmbeddingService } from "../services/embedding/EmbeddingService";
import { EmbeddingPromptStore } from "../context/prompts/EmbeddingPromptStore";

vi.mock("@root/common/util/Logger", () => {
    return {
        default: {
            withTag: () => ({
                info: vi.fn(),
                warning: vi.fn(),
                error: vi.fn()
            })
        }
    };
});

const knownVectors = new Map<string, Float32Array>();

const createVectorWithBaseSimilarity = (similarity: number): Float32Array => {
    const vector = new Float32Array(1024);

    vector[0] = similarity;
    vector[1] = Math.sqrt(1 - similarity * similarity);

    return vector;
};

const setKnownVector = (text: string, similarity: number): void => {
    knownVectors.set(text, createVectorWithBaseSimilarity(similarity));
};

const setKnownInterestVector = (keyword: string, similarity: number): void => {
    knownVectors.set(
        EmbeddingPromptStore.getEmbeddingPromptForInterestScore(keyword),
        createVectorWithBaseSimilarity(similarity)
    );
};

vi.mock("../services/embedding/EmbeddingService", () => {
    return {
        EmbeddingService: class MockEmbeddingService {
            public async embedBatch(texts: string[]): Promise<Float32Array[]> {
                return texts.map(text => {
                    const vector = knownVectors.get(text);

                    if (!vector) {
                        throw new Error(`测试缺少向量：${text}`);
                    }

                    return vector;
                });
            }
        }
    };
});

describe("SemanticRater top-k 评分", () => {
    it("应降低单个负向噪声关键词对明显相关话题的影响", async () => {
        const topic = "编程面试相关话题";
        const positiveKeywords = [
            ["求职", 0.58],
            ["实习", 0.57],
            ["算法", 0.56],
            ["测试", 0.55],
            ["前端", 0.54]
        ] as const;
        const negativeKeywords = [
            ["负向噪声高相似度", 0.59],
            ["负向低相似度一", 0.51],
            ["负向低相似度二", 0.5],
            ["负向低相似度三", 0.5],
            ["负向低相似度四", 0.49]
        ] as const;
        const rater = new SemanticRater(new EmbeddingService("http://localhost:11434", "bge-m3", 1024));

        setKnownVector(topic, 1);
        for (const [keyword, similarity] of positiveKeywords) {
            setKnownInterestVector(keyword, similarity);
        }
        for (const [keyword, similarity] of negativeKeywords) {
            setKnownInterestVector(keyword, similarity);
        }

        const score = await rater.scoreTopic(
            [
                ...positiveKeywords.map(([keyword]) => ({ keyword, liked: true })),
                ...negativeKeywords.map(([keyword]) => ({ keyword, liked: false }))
            ],
            topic
        );

        expect(score).toBeCloseTo(0.21, 6);
    });
});
