import type { SystemStats } from "@/types/system";

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

type RuntimeHintMode = "data" | "embedding";
type RuntimeHintStatus = "ok" | "warning" | "error" | "info";

interface RuntimeHintItem {
    status: RuntimeHintStatus;
    text: string;
}

interface RuntimeHintProps {
    mode: RuntimeHintMode;
    stats: SystemStats | null;
    isLoading: boolean;
}

const statusClassName: Record<RuntimeHintStatus, string> = {
    ok: "text-success",
    warning: "text-warning",
    error: "text-danger",
    info: "text-default-500"
};

function RuntimeHintIcon({ status }: { status: RuntimeHintStatus }) {
    const className = `h-4 w-4 shrink-0 ${statusClassName[status]}`;

    if (status === "ok") {
        return <CheckCircle2 className={className} />;
    }

    if (status === "error") {
        return <XCircle className={className} />;
    }

    if (status === "warning") {
        return <AlertTriangle className={className} />;
    }

    return <Info className={className} />;
}

function getDataItems(): RuntimeHintItem[] {
    return [
        {
            status: "warning",
            text: "Docker 模式不会在容器中抓取 QQ 数据，请确认宿主机 data-provider 正在运行"
        },
        {
            status: "info",
            text: "确认配置中已添加需要分析的群号"
        },
        {
            status: "info",
            text: "确认 QQ dbKey、dbBasePath 和 VFSExtPath 已填写并指向宿主机真实路径"
        }
    ];
}

function getEmbeddingItems(stats: SystemStats | null, isLoading: boolean): RuntimeHintItem[] {
    if (isLoading && !stats) {
        return [{ status: "info", text: "正在读取系统状态" }];
    }

    if (!stats) {
        return [{ status: "warning", text: "系统状态暂不可用，请确认 WebUI 后端正在运行" }];
    }

    if (!stats.runtime.aiModelReachable) {
        return [
            {
                status: "error",
                text: `AI 模型服务不可达${stats.runtime.error ? `：${stats.runtime.error}` : ""}`
            }
        ];
    }

    const embedding = stats.runtime.embedding;

    if (!embedding) {
        return [{ status: "warning", text: "Embedding 状态暂不可用" }];
    }

    return [
        {
            status: embedding.ollamaReachable ? "ok" : "error",
            text: embedding.ollamaReachable ? "Ollama 服务可达" : "Ollama 服务不可达"
        },
        {
            status: embedding.modelInstalled ? "ok" : "error",
            text: embedding.modelInstalled
                ? `Embedding 模型 ${embedding.model} 已安装`
                : `Embedding 模型 ${embedding.model} 未安装，请执行 ollama pull ${embedding.model}`
        },
        {
            status: embedding.vectorTopicCount > 0 ? "ok" : "warning",
            text: `向量库 topic 数：${embedding.vectorTopicCount}`
        }
    ];
}

export default function RuntimeHint({ mode, stats, isLoading }: RuntimeHintProps) {
    const items = mode === "data" ? getDataItems() : getEmbeddingItems(stats, isLoading);

    return (
        <div className="mx-auto mt-4 max-w-xl rounded-md border border-warning-200 bg-warning-50/70 px-4 py-3 text-left text-sm dark:border-warning-500/40 dark:bg-warning-500/10">
            <div className="mb-2 font-medium text-default-700">{mode === "data" ? "数据导入检查" : "语义检索检查"}</div>
            <div className="flex flex-col gap-2">
                {items.map(item => (
                    <div key={item.text} className="flex items-start gap-2 text-default-600">
                        <RuntimeHintIcon status={item.status} />
                        <span>{item.text}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
