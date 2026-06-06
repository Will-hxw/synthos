import { createRequire } from "module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
    findReusableTunnel,
    findReusableTunnelAfterEndpointConflict,
    isMatchingTunnelAddr,
    isNgrokEndpointConflict,
    normalizeTunnelAddr
} = require("./startPublicTunnel.cjs");

describe("startPublicTunnel", () => {
    it("应把 localhost 和 127.0.0.1 视为同一个本机目标", () => {
        expect(isMatchingTunnelAddr("http://localhost:3012", "127.0.0.1", 3012)).toBe(true);
        expect(isMatchingTunnelAddr("127.0.0.1:3012", "localhost", 3012)).toBe(true);
        expect(normalizeTunnelAddr("3012")).toEqual({ host: "localhost", port: 3012 });
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
