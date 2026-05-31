import { describe, expect, it } from "vitest";

import { parseTopKInput } from "../pages/ai-chat/components/inputs/AskInputBar";

describe("parseTopKInput", () => {
    it("空串返回 null（保留中间态，不纠正成 100）", () => {
        // 旧实现 parseInt("") || 100 会跳到 100，这里必须是 null
        expect(parseTopKInput("")).toBeNull();
    });

    it("非数字返回 null", () => {
        expect(parseTopKInput("abc")).toBeNull();
    });

    it("合法值原样返回", () => {
        expect(parseTopKInput("5")).toBe(5);
    });

    it("超出上界夹到 100", () => {
        expect(parseTopKInput("999")).toBe(100);
    });

    it("低于下界夹到 1", () => {
        expect(parseTopKInput("0")).toBe(1);
        expect(parseTopKInput("-3")).toBe(1);
    });

    it("带前导数字的输入按 parseInt 语义解析", () => {
        expect(parseTopKInput("12abc")).toBe(12);
    });
});
