#!/usr/bin/env node

const { spawn } = require("child_process");

function parseArgs(argv) {
    const env = {};
    const commandStartIndex = argv.indexOf("--");

    if (commandStartIndex < 0) {
        throw new Error("用法: node scripts/runWithEnv.cjs KEY=VALUE -- <command> [args...]");
    }

    for (const pair of argv.slice(2, commandStartIndex)) {
        const eqIndex = pair.indexOf("=");

        if (eqIndex <= 0) {
            throw new Error(`环境变量格式不正确: ${pair}`);
        }

        env[pair.slice(0, eqIndex)] = pair.slice(eqIndex + 1);
    }

    const command = argv[commandStartIndex + 1];
    const args = argv.slice(commandStartIndex + 2);

    if (!command) {
        throw new Error("缺少要执行的命令");
    }

    return {
        env,
        command,
        args
    };
}

function main() {
    const parsed = parseArgs(process.argv);
    const child = spawn(parsed.command, parsed.args, {
        cwd: process.cwd(),
        env: {
            ...process.env,
            ...parsed.env
        },
        shell: true,
        stdio: "inherit",
        windowsHide: true
    });

    child.on("exit", code => {
        process.exit(code ?? 0);
    });

    child.on("error", error => {
        console.error("执行命令失败:", error);
        process.exit(1);
    });
}

main();
