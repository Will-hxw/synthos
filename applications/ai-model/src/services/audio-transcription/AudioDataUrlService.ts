import { readFile } from "fs/promises";

import { decode, getWavFileInfo, isSilk, isWav } from "silk-wasm";

const QQ_SILK_SAMPLE_RATE = 16000;
const WAV_CHANNEL_COUNT = 1;
const WAV_BITS_PER_SAMPLE = 16;

export interface AudioDataUrlResult {
    dataUrl: string;
    byteLength: number;
    durationMs: number;
}

export class AudioDataUrlService {
    public async readAsWavDataUrl(filePath: string, maxAudioBase64Bytes: number): Promise<AudioDataUrlResult> {
        const fileBytes = await readFile(filePath);
        const wavBytes = await this._toWavBytes(fileBytes);
        const dataUrl = `data:audio/wav;base64,${wavBytes.toString("base64")}`;
        const byteLength = Buffer.byteLength(dataUrl, "utf8");

        if (byteLength > maxAudioBase64Bytes) {
            throw new Error(`音频 data URL 大小 ${byteLength} 超过上限 ${maxAudioBase64Bytes}`);
        }

        return {
            dataUrl,
            byteLength,
            durationMs: this._getWavDurationMs(wavBytes)
        };
    }

    private async _toWavBytes(fileBytes: Buffer): Promise<Buffer> {
        if (isSilk(fileBytes)) {
            const decoded = await decode(fileBytes, QQ_SILK_SAMPLE_RATE);

            return this._buildPcmS16leWav(decoded.data, QQ_SILK_SAMPLE_RATE, WAV_CHANNEL_COUNT);
        }

        if (isWav(fileBytes)) {
            return Buffer.from(fileBytes);
        }

        throw new Error("音频文件不是 SILK 或 WAV");
    }

    private _buildPcmS16leWav(pcmBytes: Uint8Array, sampleRate: number, channelCount: number): Buffer {
        const header = Buffer.alloc(44);
        const bytesPerSample = WAV_BITS_PER_SAMPLE / 8;
        const byteRate = sampleRate * channelCount * bytesPerSample;
        const blockAlign = channelCount * bytesPerSample;
        const dataSize = pcmBytes.byteLength;

        header.write("RIFF", 0, "ascii");
        header.writeUInt32LE(36 + dataSize, 4);
        header.write("WAVE", 8, "ascii");
        header.write("fmt ", 12, "ascii");
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(channelCount, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(byteRate, 28);
        header.writeUInt16LE(blockAlign, 32);
        header.writeUInt16LE(WAV_BITS_PER_SAMPLE, 34);
        header.write("data", 36, "ascii");
        header.writeUInt32LE(dataSize, 40);

        return Buffer.concat([header, Buffer.from(pcmBytes)]);
    }

    private _getWavDurationMs(wavBytes: Buffer): number {
        const info = getWavFileInfo(wavBytes);
        const dataChunk = info.chunkInfo.find(chunk => chunk.chunkId === "data");

        if (!dataChunk || info.fmt.bytesPerSec <= 0) {
            return 0;
        }

        return Math.round((dataChunk.dataLength / info.fmt.bytesPerSec) * 1000);
    }
}
