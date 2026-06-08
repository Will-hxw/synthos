import { readFile } from "fs/promises";

import { describe, expect, it } from "vitest";

import { GlobalConfigSchema } from "../services/config/schemas/GlobalConfig";

describe("配置示例文件", () => {
    it.each(["synthos_config.example.json", "docker/config/synthos_config.docker.example.json"])(
        "%s 应是合法 JSON 并通过全局配置 schema 校验",
        async configPath => {
            const rawConfig = await readFile(configPath, "utf8");
            const parsedConfig = JSON.parse(rawConfig);
            const result = GlobalConfigSchema.safeParse(parsedConfig);

            expect(result.success).toBe(true);
        }
    );
});
