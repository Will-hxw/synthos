import path from "path";

import { describe, expect, it } from "vitest";

import { AudioDataUrlService } from "../services/audio-transcription/AudioDataUrlService";

describe("AudioDataUrlService", () => {
    it("应把已生成的 WAV 样本读取为 WAV data URL", async () => {
        const service = new AudioDataUrlService();
        const samplePath = path.resolve("data/asr-smoke/qq-voice-sample.wav");

        const result = await service.readAsWavDataUrl(samplePath, 1024 * 1024);

        expect(result.dataUrl.startsWith("data:audio/wav;base64,")).toBe(true);
        expect(result.byteLength).toBeGreaterThan(0);
        expect(result.durationMs).toBeGreaterThan(0);
    });

    it("音频 data URL 超过大小上限时应抛错", async () => {
        const service = new AudioDataUrlService();
        const samplePath = path.resolve("data/asr-smoke/qq-voice-sample.wav");

        await expect(service.readAsWavDataUrl(samplePath, 10)).rejects.toThrow("超过上限");
    });
});
