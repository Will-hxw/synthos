import { readFile } from "fs/promises";

import { describe, expect, it } from "vitest";

import { GlobalConfigSchema } from "../services/config/schemas/GlobalConfig";

describe("synthos_config.example.json", () => {
    it("应是合法 JSON 并通过全局配置 schema 校验", async () => {
        const rawConfig = await readFile("synthos_config.example.json", "utf8");
        const parsedConfig = JSON.parse(rawConfig);
        const result = GlobalConfigSchema.safeParse(parsedConfig);

        expect(result.success).toBe(true);
    });
});
