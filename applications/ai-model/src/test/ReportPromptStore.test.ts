import { beforeAll, describe, expect, it } from "vitest";

import { MiddlewareContainer, CTX_MIDDLEWARE_TOKENS } from "../context/middleware/container/container";
import { ReportPromptStore } from "../context/prompts/ReportPromptStore";

describe("ReportPromptStore", () => {
    beforeAll(() => {
        MiddlewareContainer.getInstance().register(CTX_MIDDLEWARE_TOKENS.ADD_BACKGROUND_KNOWLEDGE, node => node);
    });

    it("半日报 prompt 应要求覆盖每一条话题并详细展开", async () => {
        const prompt = (
            await ReportPromptStore.getReportSummaryPrompt(
                "half-daily",
                "2026年6月9日上午",
                [
                    { topic: "话题一", detail: "包含链接和截止时间" },
                    { topic: "话题二", detail: "包含后续动作" }
                ],
                { topicCount: 2, mostActiveGroups: ["group-a"], mostActiveHour: 10 }
            )
        ).serializeToString();

        expect(prompt).toContain("必须覆盖“话题列表”中的每一条话题");
        expect(prompt).toContain("不得省略");
        expect(prompt).toContain("每条话题都要详细说明具体事件、结论、关键数字、链接、截止时间、后续动作");
        expect(prompt).toContain("1. 【话题一】");
        expect(prompt).toContain("2. 【话题二】");
        expect(prompt).not.toContain("不要重复罗列所有话题");
    });

    it("周报 prompt 应继续要求提炼核心要点", async () => {
        const prompt = (
            await ReportPromptStore.getReportSummaryPrompt(
                "weekly",
                "2026年6月1日 - 2026年6月7日 周报",
                [{ topic: "周报话题", detail: "周报详情" }],
                { topicCount: 1, mostActiveGroups: ["group-a"], mostActiveHour: 20 }
            )
        ).serializeToString();

        expect(prompt).toContain("不要重复罗列所有话题，而是提炼出核心要点");
        expect(prompt).toContain("突出最有价值、最有信息量的讨论点");
    });
});
