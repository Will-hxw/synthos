import "reflect-metadata";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { TextGeneratorService } from "../services/generators/text/TextGeneratorService";

vi.mock("@langchain/openai", () => ({
    ChatOpenAI: class MockChatOpenAI {}
}));

vi.mock("@root/common/util/Logger", () => ({
    default: {
        withTag: () => ({
            debug: vi.fn(),
            info: vi.fn(),
            warning: vi.fn(),
            error: vi.fn(),
            success: vi.fn()
        })
    }
}));

describe("TextGeneratorService", () => {
    let service: TextGeneratorService;
    const mockConfigManagerService = {
        getCurrentConfig: vi.fn()
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        mockConfigManagerService.getCurrentConfig.mockResolvedValue({
            ai: {
                pinnedModels: []
            }
        });
        service = new TextGeneratorService(mockConfigManagerService as any);
        await service.init();
    });

    it("JSON 校验场景应剥离完整包裹的 JSON 代码围栏", async () => {
        vi.spyOn(service as any, "doGenerateTextStream").mockResolvedValue('```json\n{"ok":true}\n```');

        const result = await service.generateTextWithModelCandidates(["mock-model"], "生成 JSON", true);

        expect(result).toEqual({
            selectedModelName: "mock-model",
            content: '{"ok":true}'
        });
    });

    it("非 JSON 场景应保留回答中的代码块", async () => {
        const fencedContent = '```ts\nconsole.log("ok");\n```';

        vi.spyOn(service as any, "doGenerateTextStream").mockResolvedValue(fencedContent);

        const result = await service.generateTextWithModelCandidates(["mock-model"], "生成代码", false);

        expect(result).toEqual({
            selectedModelName: "mock-model",
            content: fencedContent
        });
    });
});
