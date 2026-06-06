#!/usr/bin/env node

const { spawn } = require("child_process");
const { writeFileSync } = require("fs");
const http = require("http");
const net = require("net");

const TARGET_PORT = Number(process.env.SYNTHOS_PUBLIC_TUNNEL_TARGET_PORT || "3011");
const TARGET_HOST = process.env.SYNTHOS_PUBLIC_TUNNEL_TARGET_HOST || "127.0.0.1";
const READY_FILE = process.env.SYNTHOS_PUBLIC_TUNNEL_READY_FILE || "";
const NGROK_INSPECTOR_TUNNELS_URL = "http://127.0.0.1:4040/api/tunnels";
const START_TIMEOUT_MS = 60 * 1000;
const INSPECTOR_TIMEOUT_MS = 3000;
const TARGET_WAIT_TIMEOUT_MS = Number(process.env.SYNTHOS_PUBLIC_TUNNEL_TARGET_WAIT_TIMEOUT_MS || "120000");
const TARGET_WAIT_INTERVAL_MS = 500;
const PROXY_ENV_KEYS = [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "NO_PROXY",
    "no_proxy"
];

function log(message) {
    console.log(`[public-tunnel] ${message}`);
}

function createNgrokEnv() {
    const env = { ...process.env };

    for (const key of PROXY_ENV_KEYS) {
        delete env[key];
    }

    return env;
}

function writeReadyFile(publicUrl) {
    if (!READY_FILE) {
        return;
    }

    writeFileSync(READY_FILE, `${publicUrl}\n`, "utf8");
}

function parseNgrokLogLine(line) {
    try {
        return JSON.parse(line);
    } catch {
        return null;
    }
}

function startNgrok() {
    const args = [
        "http",
        String(TARGET_PORT),
        "--log=stdout",
        "--log-format=json",
        "--log-level=info"
    ];

    return spawn("ngrok", args, {
        env: createNgrokEnv(),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
    });
}

function isPositiveIntegerText(value) {
    if (!value) {
        return false;
    }

    for (const char of value) {
        const code = char.charCodeAt(0);

        if (code < 48 || code > 57) {
            return false;
        }
    }

    return true;
}

function normalizeHost(host) {
    const normalized = String(host || "")
        .trim()
        .toLowerCase();

    if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]") {
        return "localhost";
    }

    return normalized;
}

function normalizeTunnelAddr(addr) {
    const rawAddr = String(addr || "").trim();

    if (!rawAddr) {
        return null;
    }

    if (isPositiveIntegerText(rawAddr)) {
        return {
            host: "localhost",
            port: Number(rawAddr)
        };
    }

    let parsed;

    try {
        parsed = new URL(rawAddr.includes("://") ? rawAddr : `http://${rawAddr}`);
    } catch {
        return null;
    }

    const parsedPort = parsed.port ? Number(parsed.port) : undefined;

    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        return null;
    }

    return {
        host: normalizeHost(parsed.hostname),
        port: parsedPort
    };
}

function isMatchingTunnelAddr(addr, targetHost, targetPort) {
    const normalizedAddr = normalizeTunnelAddr(addr);

    if (!normalizedAddr) {
        return false;
    }

    return normalizedAddr.host === normalizeHost(targetHost) && normalizedAddr.port === targetPort;
}

function isNgrokEndpointConflict(errorText) {
    return String(errorText || "").includes("ERR_NGROK_334");
}

function requestJson(url, timeoutMs = INSPECTOR_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, res => {
            let body = "";

            res.setEncoding("utf8");
            res.on("data", chunk => {
                body += chunk;
            });
            res.on("end", () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`ngrok inspector 返回状态码 ${res.statusCode}`));
                    return;
                }

                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error("ngrok inspector 请求超时"));
        });

        req.on("error", reject);
    });
}

async function findReusableTunnel(options = {}) {
    const targetHost = options.targetHost || TARGET_HOST;
    const targetPort = options.targetPort || TARGET_PORT;
    const tunnelsUrl = options.tunnelsUrl || NGROK_INSPECTOR_TUNNELS_URL;
    const readJson = options.requestJson || requestJson;
    let inspectorResult;

    try {
        inspectorResult = await readJson(tunnelsUrl);
    } catch {
        return null;
    }

    const tunnels = Array.isArray(inspectorResult?.tunnels) ? inspectorResult.tunnels : [];

    for (const tunnel of tunnels) {
        if (typeof tunnel?.public_url !== "string" || tunnel.public_url.trim() === "") {
            continue;
        }

        if (isMatchingTunnelAddr(tunnel?.config?.addr, targetHost, targetPort)) {
            return tunnel;
        }
    }

    return null;
}

async function findReusableTunnelAfterEndpointConflict(errorText, options = {}) {
    if (!isNgrokEndpointConflict(errorText)) {
        return null;
    }

    return findReusableTunnel(options);
}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

function canConnectTarget() {
    return new Promise(resolve => {
        const socket = net.createConnection({ host: TARGET_HOST, port: TARGET_PORT });

        socket.once("connect", () => {
            socket.end();
            resolve(true);
        });

        socket.once("error", () => {
            socket.destroy();
            resolve(false);
        });

        socket.setTimeout(1000, () => {
            socket.destroy();
            resolve(false);
        });
    });
}

async function waitForTargetReady() {
    const deadline = Date.now() + TARGET_WAIT_TIMEOUT_MS;

    while (Date.now() < deadline) {
        if (await canConnectTarget()) {
            log(`目标服务已就绪: ${TARGET_HOST}:${TARGET_PORT}`);
            return;
        }

        await sleep(TARGET_WAIT_INTERVAL_MS);
    }

    throw new Error(`等待目标服务超时: ${TARGET_HOST}:${TARGET_PORT}`);
}

let ngrokProcess = null;
let isStopping = false;
let reuseKeepAliveTimer = null;

function keepAliveForReusedTunnel() {
    if (reuseKeepAliveTimer) {
        return;
    }

    reuseKeepAliveTimer = setInterval(() => {}, 60 * 60 * 1000);
}

function stopReuseKeepAlive() {
    if (!reuseKeepAliveTimer) {
        return;
    }

    clearInterval(reuseKeepAliveTimer);
    reuseKeepAliveTimer = null;
}

function activateReusableTunnel(tunnel, reason) {
    writeReadyFile(tunnel.public_url);
    log(`${reason}: ${tunnel.public_url}`);
    log(`公网地址: ${tunnel.public_url}`);
    keepAliveForReusedTunnel();
}

async function main() {
    await waitForTargetReady();

    const reusableTunnel = await findReusableTunnel();

    if (reusableTunnel) {
        activateReusableTunnel(reusableTunnel, "复用已存在的 ngrok 隧道");
        return;
    }

    let isReady = false;
    let isReusingExistingTunnel = false;
    let endpointConflictPromise = null;
    let stdoutBuffer = "";

    ngrokProcess = startNgrok();

    const startupTimer = setTimeout(() => {
        if (isReady) {
            return;
        }

        log("ngrok 启动超时，未拿到公网 URL。");
        ngrokProcess.kill();
        process.exit(1);
    }, START_TIMEOUT_MS);

    ngrokProcess.stdout.on("data", chunk => {
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split("\n");

        stdoutBuffer = lines.pop() || "";

        for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed) {
                continue;
            }

            const parsed = parseNgrokLogLine(trimmed);

            if (!parsed) {
                log(trimmed);
                continue;
            }

            if (parsed.msg === "started tunnel" && parsed.url) {
                isReady = true;
                clearTimeout(startupTimer);
                writeReadyFile(parsed.url);
                log(`公网地址: ${parsed.url}`);
                continue;
            }

            if (parsed.lvl === "crit" && parsed.err) {
                log(`ngrok 错误: ${parsed.err}`);

                if (isNgrokEndpointConflict(parsed.err) && !endpointConflictPromise) {
                    endpointConflictPromise = findReusableTunnelAfterEndpointConflict(parsed.err).then(tunnel => {
                        if (!tunnel) {
                            log(
                                `未在本机 ngrok inspector 中找到指向 ${TARGET_HOST}:${TARGET_PORT} 的既有隧道。请先停止占用该 endpoint 的旧隧道，或改用一个唯一的 ngrok URL。`
                            );
                            return;
                        }

                        isReady = true;
                        isReusingExistingTunnel = true;
                        clearTimeout(startupTimer);
                        activateReusableTunnel(tunnel, "ngrok endpoint 已在线，复用本机既有隧道");
                    });
                }
            }
        }
    });

    ngrokProcess.stderr.on("data", chunk => {
        process.stderr.write(chunk);
    });

    ngrokProcess.on("error", error => {
        clearTimeout(startupTimer);
        log(`无法启动 ngrok: ${error.message}`);
        process.exit(1);
    });

    ngrokProcess.on("exit", code => {
        clearTimeout(startupTimer);

        if (endpointConflictPromise) {
            endpointConflictPromise.finally(() => {
                if (isReusingExistingTunnel) {
                    return;
                }

                process.exit(code ?? 1);
            });
            return;
        }

        if (isReusingExistingTunnel) {
            return;
        }

        if (!isReady) {
            process.exit(code ?? 1);
            return;
        }

        log("ngrok 已退出。");
        process.exit(code ?? 0);
    });
}

function stopNgrok() {
    if (!ngrokProcess || ngrokProcess.exitCode !== null) {
        return;
    }

    ngrokProcess.kill();
}

function requestStop(exitCode) {
    if (isStopping) {
        return;
    }

    isStopping = true;
    stopNgrok();
    stopReuseKeepAlive();

    if (!ngrokProcess || ngrokProcess.exitCode !== null) {
        process.exit(exitCode);
    }
}

process.on("SIGINT", () => {
    requestStop(130);
});

process.on("SIGTERM", () => {
    requestStop(143);
});

if (require.main === module) {
    main().catch(error => {
        log(error?.message || String(error));
        process.exit(1);
    });
}

module.exports = {
    findReusableTunnel,
    findReusableTunnelAfterEndpointConflict,
    isMatchingTunnelAddr,
    isNgrokEndpointConflict,
    normalizeTunnelAddr
};
