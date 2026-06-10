#!/usr/bin/env node

const path = require("path");
const { spawn } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const launcherPath = path.join(rootDir, "scripts", "launchDevGroup.cjs");

const child = spawn(process.execPath, [launcherPath, "--group", "all"], {
    cwd: rootDir,
    stdio: "inherit",
    windowsHide: true
});

function forwardSignal(signal) {
    if (child.exitCode !== null) {
        return;
    }

    child.kill(signal);
}

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
});

child.on("error", err => {
    console.error("启动完整开发环境失败:", err);
    process.exit(1);
});
