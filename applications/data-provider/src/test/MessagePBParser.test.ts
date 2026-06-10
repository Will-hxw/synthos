import path from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadFile, mockLogger, mockParse, mockLookupType, mockMessageType } = vi.hoisted(() => {
    const messageType = {
        decode: vi.fn(),
        toObject: vi.fn()
    };
    const lookupType = vi.fn(() => messageType);
    const parse = vi.fn(() => ({
        root: {
            lookupType
        }
    }));

    return {
        mockReadFile: vi.fn(),
        mockLogger: {
            debug: vi.fn(),
            warning: vi.fn(),
            error: vi.fn(),
            success: vi.fn()
        },
        mockParse: parse,
        mockLookupType: lookupType,
        mockMessageType: messageType
    };
});

vi.mock("fs/promises", () => ({
    readFile: mockReadFile
}));

vi.mock("protobufjs", () => ({
    default: {
        parse: mockParse
    },
    parse: mockParse
}));

vi.mock("@root/common/util/Logger", () => ({
    default: {
        withTag: () => mockLogger
    }
}));

vi.mock("@root/common/util/lifecycle/mustInitBeforeUse", () => ({
    mustInitBeforeUse: <T extends new (...args: any[]) => any>(constructor: T) => constructor
}));

vi.mock("@root/common/util/lifecycle/Disposable", () => ({
    Disposable: class MockDisposable {
        protected _registerDisposable<T>(disposable: T): T {
            return disposable;
        }
        protected _registerDisposableFunction(_func: () => Promise<void> | void): void {}
        async dispose(): Promise<void> {}
    }
}));

import { MessagePBParser } from "../providers/QQProvider/parsers/MessagePBParser";

describe("MessagePBParser", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockReadFile.mockImplementation(async (filePath: string) => {
            const normalizedPath = String(filePath);

            if (path.isAbsolute(normalizedPath) && normalizedPath.endsWith("messageSegment.proto")) {
                return "message Message {}";
            }

            throw new Error(`unexpected proto path: ${normalizedPath}`);
        });
        mockParse.mockReturnValue({
            root: {
                lookupType: mockLookupType
            }
        });
        mockLookupType.mockReturnValue(mockMessageType);
        mockMessageType.decode.mockReturnValue({});
        mockMessageType.toObject.mockReturnValue({ messages: [] });
    });

    it("init 应优先使用基于模块位置的绝对 proto 路径", async () => {
        const parser = new MessagePBParser();

        await parser.init();

        const firstPath = String(mockReadFile.mock.calls[0][0]);

        expect(path.isAbsolute(firstPath)).toBe(true);
        expect(firstPath.endsWith(path.join("parsers", "messageSegment.proto"))).toBe(true);
        expect(mockLookupType).toHaveBeenCalledWith("Message");
    });

    it("parseMessageSegment 应保留 bytes 字段为 Buffer", async () => {
        const parser = new MessagePBParser();
        const waveAmplitudes = Buffer.from([1, 2, 3]);

        await parser.init();
        mockMessageType.decode.mockReturnValue({ messages: [{ waveAmplitudes }] });
        mockMessageType.toObject.mockImplementation((_message: unknown, options: unknown) => ({
            messages: [{ waveAmplitudes }],
            options
        }));

        const result = parser.parseMessageSegment(Buffer.from("mock")) as any;
        const conversionOptions = mockMessageType.toObject.mock.calls[0][1];

        expect(conversionOptions).toMatchObject({ bytes: Buffer });
        expect(Buffer.isBuffer(result.messages[0].waveAmplitudes)).toBe(true);
        expect(result.messages[0].waveAmplitudes).toBe(waveAmplitudes);
    });
});
