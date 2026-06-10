import { describe, expect, it } from "vitest";

import { formatApplicationCardMessage } from "../providers/QQProvider/formatters/ApplicationCardMessageFormatter";

describe("formatApplicationCardMessage", () => {
    it.each([
        ["123", "[卡片消息，123]"],
        ["true", "[卡片消息，true]"],
        ["null", "[卡片消息，null]"],
        ['"纯文本"', "[卡片消息，纯文本]"]
    ])("应保留顶层 JSON 基本类型内容：%s", (rawContent, expected) => {
        expect(formatApplicationCardMessage(rawContent)).toBe(expected);
    });
});
