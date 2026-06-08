import { GlobalConfig } from "@root/common/services/config/schemas/GlobalConfig";

type AudioTranscriptionConfig = GlobalConfig["ai"]["audioTranscription"];

interface MimoChatCompletionResponse {
    choices?: Array<{
        message?: {
            content?: string | Array<{ type?: string; text?: string }>;
        };
    }>;
}

export class MimoAsrClient {
    public async transcribe(wavDataUrl: string, config: AudioTranscriptionConfig): Promise<string> {
        const endpoint = this._joinChatCompletionEndpoint(config.baseURL);
        const response = await this._fetchWithTimeout(
            endpoint,
            {
                method: "POST",
                headers: {
                    "api-key": config.apiKey,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "input_audio",
                                    input_audio: {
                                        data: wavDataUrl
                                    }
                                }
                            ]
                        }
                    ],
                    asr_options: {
                        language: config.language
                    }
                })
            },
            config.requestTimeoutMs
        );

        if (!response.ok) {
            const body = await response.text();

            throw new Error(`Mimo ASR HTTP ${response.status}: ${this._truncateText(body, 240)}`);
        }

        const responseJson = (await response.json()) as MimoChatCompletionResponse;
        const transcript = this._extractTranscript(responseJson);

        if (!transcript) {
            throw new Error("Mimo ASR 未返回转写文本");
        }

        return transcript;
    }

    private _joinChatCompletionEndpoint(baseURL: string): string {
        const trimmed = baseURL.endsWith("/") ? baseURL.slice(0, -1) : baseURL;

        return `${trimmed}/chat/completions`;
    }

    private async _fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            return await fetch(url, {
                ...init,
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeout);
        }
    }

    private _extractTranscript(responseJson: MimoChatCompletionResponse): string {
        const content = responseJson.choices?.[0]?.message?.content;

        if (typeof content === "string") {
            return this._normalizeInlineText(content);
        }

        if (Array.isArray(content)) {
            return this._normalizeInlineText(
                content
                    .map(item => (item.type === "text" || !item.type ? item.text || "" : ""))
                    .filter(Boolean)
                    .join("")
            );
        }

        return "";
    }

    private _normalizeInlineText(value: string): string {
        let result = "";
        let hasPendingSpace = false;

        for (const char of value.trim()) {
            if (char === " " || char === "\n" || char === "\r" || char === "\t") {
                hasPendingSpace = result.length > 0;
                continue;
            }

            if (hasPendingSpace) {
                result += " ";
                hasPendingSpace = false;
            }

            result += char;
        }

        return result.trim();
    }

    private _truncateText(value: string, maxLength: number): string {
        if (value.length <= maxLength) {
            return value;
        }

        return `${value.slice(0, maxLength)}...`;
    }
}
