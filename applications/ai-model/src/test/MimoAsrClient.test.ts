import { beforeEach, describe, expect, it, vi } from "vitest";

import { MimoAsrClient } from "../services/audio-transcription/MimoAsrClient";

describe("MimoAsrClient", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it("应使用 Mimo chat completions endpoint、api-key header 和 ASR 请求体", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    choices: [
                        {
                            message: {
                                content: "  你好  世界  "
                            }
                        }
                    ]
                }),
                { status: 200 }
            )
        );

        vi.stubGlobal("fetch", fetchMock);
        const client = new MimoAsrClient();

        const transcript = await client.transcribe("data:audio/wav;base64,AAAA", createConfig());

        expect(transcript).toBe("你好 世界");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        const body = JSON.parse(init.body as string);

        expect(url).toBe("https://token-plan-sgp.xiaomimimo.com/v1/chat/completions");
        expect(init.method).toBe("POST");
        expect(init.headers).toMatchObject({
            "api-key": "test-key",
            "Content-Type": "application/json"
        });
        expect(body).toEqual({
            model: "mimo-v2.5-asr",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_audio",
                            input_audio: {
                                data: "data:audio/wav;base64,AAAA"
                            }
                        }
                    ]
                }
            ],
            asr_options: {
                language: "zh"
            }
        });
    });

    it("HTTP 失败时应抛出包含状态码的错误", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })));
        const client = new MimoAsrClient();

        await expect(client.transcribe("data:audio/wav;base64,AAAA", createConfig())).rejects.toThrow(
            "Mimo ASR HTTP 401"
        );
    });
});

function createConfig() {
    return {
        enabled: true,
        baseURL: "https://token-plan-sgp.xiaomimimo.com/v1/",
        apiKey: "test-key",
        model: "mimo-v2.5-asr",
        language: "zh",
        batchSize: 20,
        maxRetryCount: 2,
        requestTimeoutMs: 60000,
        maxAudioBase64Bytes: 1048576
    };
}
