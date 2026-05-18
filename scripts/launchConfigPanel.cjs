#!/usr/bin/env node

/**
 * launchConfigPanel.cjs - 启动配置面板的脚本
 * 以轻量级模式启动 webui-backend 和 webui-frontend
 */

const { spawn } = require("child_process");
const path = require("path");
const { runPreStartCommand, stopPreStartCommand } = require("./preStartCommand.cjs");

const rootDir = path.resolve(__dirname, "..");

const buildInterval = 2000;

/**
 * 启动配置面板后端（轻量级模式）
 */
function startBackend() {
    return new Promise((resolve, reject) => {
        console.log("\n🔧 启动配置面板后端服务（轻量级模式）...");

        const projectPath = path.join(rootDir, "applications", "webui-backend");

        const backendProcess = spawn("pnpm", ["run", "dev:config-panel"], {
            cwd: projectPath,
            stdio: ["ignore", "inherit", "inherit"],
            shell: true,
            env: {
                ...process.env,
                CONFIG_PANEL_MODE: "true",
                CONFIG_PANEL_PORT: "3002"
            }
        });

        backendProcess.on("close", code => {
            if (code !== 0) {
                console.error(`❌ 配置面板后端退出，退出码: ${code}`);
            }
        });

        backendProcess.on("error", error => {
            console.error("❌ 启动配置面板后端时出错:", error);
            reject(error);
        });

        resolve();
    });
}

/**
 * 启动配置面板前端
 */
function startFrontend() {
    return new Promise((resolve, reject) => {
        console.log("\n🎨 启动配置面板前端服务...");

        const projectPath = path.join(rootDir, "applications", "webui-frontend");

        const frontendProcess = spawn("pnpm", ["run", "dev"], {
            cwd: projectPath,
            stdio: ["ignore", "inherit", "inherit"],
            shell: true,
            env: {
                ...process.env,
                VITE_CONFIG_PANEL_MODE: "true"
            }
        });

        frontendProcess.on("close", code => {
            if (code !== 0) {
                console.error(`❌ 配置面板前端退出，退出码: ${code}`);
            }
        });

        frontendProcess.on("error", error => {
            console.error("❌ 启动配置面板前端时出错:", error);
            reject(error);
        });

        resolve();
    });
}

/**
 * 延迟函数
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 主函数：启动配置面板
 */
async function launchConfigPanel() {
    console.log("🚀 启动 Synthos 配置面板");
    console.log("📋 将启动: webui-backend（轻量级模式）+ webui-frontend");
    console.log("");

    try {
        // 启动全部子项目之前，先执行启动前命令（独立子进程执行，不等待其完成）
        await runPreStartCommand(rootDir);

        await startBackend();
        await delay(buildInterval);
        await startFrontend();

        console.log("\n✅ 配置面板启动完成！");
        console.log("📝 后端地址: http://localhost:3002");
        console.log("🌐 前端地址: http://localhost:3011");
        console.log("");
        console.log("💡 提示: 修改配置后需要手动重启相关服务才能生效");
    } catch (error) {
        console.error("💥 启动配置面板时发生错误:", error);
        process.exit(1);
    }
}

launchConfigPanel();

process.on("SIGINT", () => {
    stopPreStartCommand("SIGINT");
});

process.on("SIGTERM", () => {
    stopPreStartCommand("SIGTERM");
});
