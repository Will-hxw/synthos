#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v ollama &>/dev/null; then
    echo "[run.sh] 错误：未检测到 Ollama，请先安装 Ollama。"
    echo "[run.sh] 下载地址：https://ollama.com/download"
    exit 1
fi

if ! command -v ngrok &>/dev/null; then
    echo "[run.sh] 错误：未检测到 ngrok，请先安装并配置 ngrok。"
    exit 1
fi

if ! curl -s http://localhost:11434 &>/dev/null; then
    echo "[run.sh] Ollama 服务未运行，正在启动..."
    ollama serve &

    while ! curl -s http://localhost:11434 &>/dev/null; do
        echo "[run.sh] 等待 Ollama 启动..."
        sleep 2
    done

    echo "[run.sh] Ollama 服务已就绪"
else
    echo "[run.sh] Ollama 服务已运行"
fi

pnpm dev:public-preview
