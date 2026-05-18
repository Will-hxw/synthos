#!/usr/bin/env bash
set -e

# 检查 Ollama 是否已安装
if ! command -v ollama &>/dev/null; then
    echo "[run.sh] 错误：未检测到 Ollama，请先安装 Ollama。"
    echo "[run.sh] 下载地址：https://ollama.com/download"
    exit 1
fi

# 检查 Ollama 服务是否已启动
if ! curl -s http://localhost:11434 &>/dev/null; then
    echo "[run.sh] Ollama 服务未运行，正在启动..."
    ollama serve &
    OLLAMA_PID=$!
    while ! curl -s http://localhost:11434 &>/dev/null; do
        echo "[run.sh] 等待 Ollama 启动..."
        sleep 2
    done
    echo "[run.sh] Ollama 服务已就绪"
else
    echo "[run.sh] Ollama 服务已运行"
fi

pnpm dev:all
