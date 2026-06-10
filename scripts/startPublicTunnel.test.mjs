import { createRequire } from "module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
    findReusableTunnel,
    findReusableTunnelAfterEndpointConflict,
    formatNgrokTargetAddr,
    isMatchingTunnelAddr,
    isNgrokEndpointConflict,
    normalizeTunnelAddr,
    resolveNgrokCommand
} = require("./startPublicTunnel.cjs");

describe("startPublicTunnel", () => {
    it("应把 localhost 和 127.0.0.1 视为同一个本机目标", () => {
        expect(isMatchingTunnelAddr("http://localhost:3012", "127.0.0.1", 3012)).toBe(true);
        expect(isMatchingTunnelAddr("127.0.0.1:3012", "localhost", 3012)).toBe(true);
        expect(normalizeTunnelAddr("3012")).toEqual({ host: "localhost", port: 3012 });
    });

    it("新建 ngrok 隧道时应传入目标主机和端口", () => {
        expect(formatNgrokTargetAddr("127.0.0.1", 3012)).toBe("127.0.0.1:3012");
        expect(formatNgrokTargetAddr("localhost", 3011)).toBe("localhost:3011");
        expect(formatNgrokTargetAddr("::1", 3012)).toBe("[::1]:3012");
    });

    it("应优先使用显式指定的 ngrok 可执行文件", () => {
        expect(
            resolveNgrokCommand({
                envBin: "D:/tools/ngrok.exe",
                existsSync: () => false
            })
        ).toBe("D:/tools/ngrok.exe");
    });

    it("应优先使用仓库内的 ngrok 可执行文件", () => {
        const rootDir = "D:/repo";
        const expected = "D:\\repo\\node_modules\\ngrok\\bin\\ngrok.exe";
        const command = resolveNgrokCommand({
            rootDir,
            platform: "win32",
            existsSync: filePath => filePath === expected
        });

        expect(command).toBe(expected);
    });

    it("inspector 不可用时不应阻断后续新建隧道", async () => {
        const tunnel = await findReusableTunnel({
            targetHost: "127.0.0.1",
            targetPort: 3012,
            requestJson: async () => {
                throw new Error("inspector 不可用");
            }
        });

        expect(tunnel).toBeNull();
    });

    it("应复用指向当前目标端口的既有 ngrok 隧道", async () => {
        const tunnel = await findReusableTunnel({
            targetHost: "127.0.0.1",
            targetPort: 3012,
            requestJson: async () => ({
                tunnels: [
                    {
                        public_url: "https://example.ngrok-free.dev",
                        config: {
                            addr: "http://localhost:3012"
                        }
                    }
                ]
            })
        });

        expect(tunnel?.public_url).toBe("https://example.ngrok-free.dev");
    });

    it("不应复用指向其他端口的 ngrok 隧道", async () => {
        const tunnel = await findReusableTunnel({
            targetHost: "127.0.0.1",
            targetPort: 3012,
            requestJson: async () => ({
                tunnels: [
                    {
                        public_url: "https://other.ngrok-free.dev",
                        config: {
                            addr: "http://localhost:3011"
                        }
                    }
                ]
            })
        });

        expect(tunnel).toBeNull();
    });

    it("ERR_NGROK_334 后应再次查询并复用本机匹配隧道", async () => {
        expect(isNgrokEndpointConflict("ERR_NGROK_334")).toBe(true);

        const tunnel = await findReusableTunnelAfterEndpointConflict("failed to start tunnel: ERR_NGROK_334", {
            targetHost: "127.0.0.1",
            targetPort: 3012,
            requestJson: async () => ({
                tunnels: [
                    {
                        public_url: "https://reused.ngrok-free.dev",
                        config: {
                            addr: "http://localhost:3012"
                        }
                    }
                ]
            })
        });

        expect(tunnel?.public_url).toBe("https://reused.ngrok-free.dev");
    });

    it("ERR_NGROK_334 后本机无匹配隧道时应返回空结果", async () => {
        const tunnel = await findReusableTunnelAfterEndpointConflict("failed to start tunnel: ERR_NGROK_334", {
            targetHost: "127.0.0.1",
            targetPort: 3012,
            requestJson: async () => ({
                tunnels: []
            })
        });

        expect(tunnel).toBeNull();
    });
});
