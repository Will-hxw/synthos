#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# ──────────────────────────────────────────────
# MongoDB
# ──────────────────────────────────────────────
MONGO_HOST="${SYNTHOS_MONGO_HOST:-localhost}"
MONGO_PORT="${SYNTHOS_MONGO_PORT:-27017}"
MONGO_URI="mongodb://${MONGO_HOST}:${MONGO_PORT}"

mongo_is_running() {
    # Use mongosh if available, otherwise fall back to a TCP port check via /dev/tcp
    if command -v mongosh &>/dev/null; then
        mongosh --quiet --eval "db.runCommand({ping:1})" "$MONGO_URI" &>/dev/null
    elif command -v mongo &>/dev/null; then
        mongo --quiet --eval "db.runCommand({ping:1})" "$MONGO_URI" &>/dev/null
    else
        # Bash-only: try opening the TCP port (may not work in all shells)
        (echo >/dev/tcp/"$MONGO_HOST"/"$MONGO_PORT") 2>/dev/null
    fi
}

start_mongod() {
    # Try common data directories
    local data_dirs=(
        "$HOME/data/db"
        "/data/db"
        "/usr/local/var/mongodb"
        "/opt/homebrew/var/mongodb"
    )
    for dir in "${data_dirs[@]}"; do
        if [[ -d "$dir" ]]; then
            echo "[run.sh] 使用数据目录: $dir"
            mongod --dbpath "$dir" --fork --logpath /tmp/mongod-runsh.log 2>/dev/null && return 0
        fi
    done
    # Last resort: create a temp data dir
    local tmp_dir="$HOME/.synthos-mongo-data"
    mkdir -p "$tmp_dir"
    echo "[run.sh] 使用临时数据目录: $tmp_dir"
    mongod --dbpath "$tmp_dir" --fork --logpath /tmp/mongod-runsh.log 2>/dev/null
}

if mongo_is_running; then
    echo "[run.sh] MongoDB 已运行 (${MONGO_URI})"
else
    echo "[run.sh] MongoDB 未运行，正在启动..."

    started=false

    # 1) Windows service (most common on Windows)
    if command -v net &>/dev/null && net start 2>/dev/null | grep -qi mongodb; then
        echo "[run.sh] 通过 net start 启动 MongoDB Windows 服务..."
        net start MongoDB 2>/dev/null && started=true
    fi

    # 2) systemd (Linux)
    if ! $started && command -v systemctl &>/dev/null && systemctl list-units --type=service --all 2>/dev/null | grep -q mongod; then
        echo "[run.sh] 通过 systemctl 启动 mongod..."
        sudo systemctl start mongod 2>/dev/null && started=true
    fi

    # 3) Homebrew services (macOS)
    if ! $started && command -v brew &>/dev/null; then
        echo "[run.sh] 通过 brew services 启动 mongodb..."
        brew services start mongodb-community 2>/dev/null && started=true
    fi

    # 4) Direct mongod (cross-platform fallback)
    if ! $started && command -v mongod &>/dev/null; then
        echo "[run.sh] 直接启动 mongod..."
        start_mongod && started=true
    fi

    # 5) Docker fallback
    if ! $started && command -v docker &>/dev/null; then
        echo "[run.sh] 通过 Docker 启动 MongoDB..."
        docker run -d --name synthos-mongo-runsh \
            -p "${MONGO_PORT}:27017" \
            mongo:7 2>/dev/null && started=true
    fi

    if ! $started; then
        echo "[run.sh] 错误：无法自动启动 MongoDB。"
        echo "[run.sh] 请手动启动 MongoDB 后重试，或设置 SYNTHOS_MONGODB_URL 指向已有实例。"
        echo "[run.sh] 安装指引：https://www.mongodb.com/try/download/community"
        exit 1
    fi

    # Wait for MongoDB to become reachable
    echo "[run.sh] 等待 MongoDB 就绪..."
    for i in $(seq 1 30); do
        if mongo_is_running; then
            echo "[run.sh] MongoDB 已就绪 (${MONGO_URI})"
            break
        fi
        sleep 1
    done

    if ! mongo_is_running; then
        echo "[run.sh] 错误：MongoDB 启动超时，请检查日志 /tmp/mongod-runsh.log"
        exit 1
    fi
fi

# ──────────────────────────────────────────────
# Ollama
# ──────────────────────────────────────────────
if ! command -v ollama &>/dev/null; then
    echo "[run.sh] 错误：未检测到 Ollama，请先安装 Ollama。"
    echo "[run.sh] 下载地址：https://ollama.com/download"
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

# ──────────────────────────────────────────────
# 启动项目
# ──────────────────────────────────────────────
pnpm dev:all
