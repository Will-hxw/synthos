#!/usr/bin/env node

const { spawn } = require("child_process");
const { writeFileSync } = require("fs");
const net = require("net");

const TARGET_PORT = Number(process.env.SYNTHOS_PUBLIC_TUNNEL_TARGET_PORT || "3011");
const TARGET_HOST = process.env.SYNTHOS_PUBLIC_TUNNEL_TARGET_HOST || "127.0.0.1";
const READY_FILE = process.env.SYNTHOS_PUBLIC_TUNNEL_READY_FILE || "";
const START_TIMEOUT_MS = 60 * 1000;
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

async function main() {
    await waitForTargetReady();

    let isReady = false;
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

    if (!ngrokProcess) {
        process.exit(exitCode);
    }
}

process.on("SIGINT", () => {
    requestStop(130);
});

process.on("SIGTERM", () => {
    requestStop(143);
});

main().catch(error => {
    log(error?.message || String(error));
    process.exit(1);
});
