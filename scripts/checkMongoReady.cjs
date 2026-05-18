#!/usr/bin/env node

const net = require("net");

const DEFAULT_MONGODB_URL = "mongodb://localhost:27017/synthos";
const DEFAULT_MONGODB_PORT = 27017;
const DEFAULT_TIMEOUT_MS = 5000;

function resolveMongoUrl() {
    if (process.env.SYNTHOS_MONGODB_URL) {
        return {
            source: "SYNTHOS_MONGODB_URL",
            url: process.env.SYNTHOS_MONGODB_URL
        };
    }

    if (process.env.MONGODB_URL) {
        return {
            source: "MONGODB_URL",
            url: process.env.MONGODB_URL
        };
    }

    return {
        source: "默认值",
        url: DEFAULT_MONGODB_URL
    };
}

function parseEndpoint(rawUrl) {
    let addressPart = rawUrl;
    const schemeIndex = addressPart.indexOf("://");

    if (schemeIndex >= 0) {
        addressPart = addressPart.slice(schemeIndex + 3);
    }

    const authIndex = addressPart.indexOf("@");

    if (authIndex >= 0) {
        addressPart = addressPart.slice(authIndex + 1);
    }

    const pathIndex = addressPart.indexOf("/");

    if (pathIndex >= 0) {
        addressPart = addressPart.slice(0, pathIndex);
    }

    const queryIndex = addressPart.indexOf("?");

    if (queryIndex >= 0) {
        addressPart = addressPart.slice(0, queryIndex);
    }

    const firstHost = addressPart.split(",")[0];

    if (!firstHost) {
        throw new Error("MongoDB 地址中缺少主机名");
    }

    if (firstHost.startsWith("[")) {
        const closeIndex = firstHost.indexOf("]");

        if (closeIndex < 0) {
            throw new Error("MongoDB IPv6 地址格式不合法");
        }

        const host = firstHost.slice(1, closeIndex);
        const portText = firstHost.slice(closeIndex + 1).startsWith(":") ? firstHost.slice(closeIndex + 2) : "";

        return {
            host,
            port: portText ? Number(portText) : DEFAULT_MONGODB_PORT
        };
    }

    const portIndex = firstHost.lastIndexOf(":");
    const host = portIndex >= 0 ? firstHost.slice(0, portIndex) : firstHost;
    const portText = portIndex >= 0 ? firstHost.slice(portIndex + 1) : "";
    const port = portText ? Number(portText) : DEFAULT_MONGODB_PORT;

    if (!host) {
        throw new Error("MongoDB 地址中缺少主机名");
    }

    if (!Number.isInteger(port) || port <= 0) {
        throw new Error("MongoDB 地址中的端口不合法");
    }

    return {
        host,
        port
    };
}

function waitForTcp(endpoint) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({
            host: endpoint.host,
            port: endpoint.port
        });

        socket.setTimeout(DEFAULT_TIMEOUT_MS);

        socket.once("connect", () => {
            socket.end();
            resolve();
        });

        socket.once("timeout", () => {
            socket.destroy();
            reject(new Error("连接超时"));
        });

        socket.once("error", error => {
            socket.destroy();
            reject(error);
        });
    });
}

async function checkMongoReady() {
    const resolved = resolveMongoUrl();
    const endpoint = parseEndpoint(resolved.url);

    try {
        await waitForTcp(endpoint);
        console.log(`[MongoDB 检查] MongoDB 可达（${resolved.source}: ${endpoint.host}:${endpoint.port}）。`);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);

        console.error("[MongoDB 检查] MongoDB 不可达，启动已中止。");
        console.error(`[MongoDB 检查] 检查来源：${resolved.source}`);
        console.error(`[MongoDB 检查] 检查目标：${endpoint.host}:${endpoint.port}`);
        console.error("[MongoDB 检查] 请先启动 MongoDB，或设置 SYNTHOS_MONGODB_URL / MONGODB_URL 指向可用实例。");
        console.error(`[MongoDB 检查] 原始错误：${detail}`);
        throw error;
    }
}

if (require.main === module) {
    checkMongoReady().catch(() => {
        process.exit(1);
    });
}

module.exports = {
    checkMongoReady,
    parseEndpoint,
    resolveMongoUrl
};
