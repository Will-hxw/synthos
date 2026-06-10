/**
 * 杂项服务
 */
import https from "https";

import { injectable } from "tsyringe";

type QQAvatarType = "group" | "user";

/** QQ 头像下载超时（毫秒） */
const QQ_AVATAR_TIMEOUT_MS = 10_000;
/** QQ 头像响应体最大字节数（1 MiB） */
const QQ_AVATAR_MAX_SIZE = 1_048_576;

@injectable()
export class MiscService {
    /**
     * 获取健康检查信息
     */
    public getHealthInfo() {
        return {
            message: "WebUI后端服务运行正常",
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 下载 QQ 头像并返回 base64 编码
     */
    public async getQQAvatarBase64(qqNumber: string, type: QQAvatarType): Promise<string> {
        const avatarUrl = this._getQQAvatarUrl(qqNumber, type);
        const avatarBuffer = await this._downloadImage(avatarUrl);

        return avatarBuffer.toString("base64");
    }

    /**
     * 获取 QQ 头像源地址
     */
    private _getQQAvatarUrl(qqNumber: string, type: QQAvatarType): string {
        if (type === "group") {
            return `https://p.qlogo.cn/gh/${qqNumber}/${qqNumber}/0`;
        }

        return `https://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=100`;
    }

    /**
     * 下载图片
     */
    private _downloadImage(url: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const req = https.get(url, { timeout: QQ_AVATAR_TIMEOUT_MS }, res => {
                if (res.statusCode !== 200) {
                    res.destroy();
                    reject(new Error(`HTTP 状态码 ${res.statusCode}`));

                    return;
                }

                const chunks: Buffer[] = [];
                let totalSize = 0;

                res.on("data", chunk => {
                    totalSize += chunk.length;

                    if (totalSize > QQ_AVATAR_MAX_SIZE) {
                        res.destroy();
                        reject(new Error("响应体超过大小上限"));

                        return;
                    }

                    chunks.push(chunk);
                });
                res.on("end", () => resolve(Buffer.concat(chunks)));
            });

            req.on("timeout", () => {
                req.destroy();
                reject(new Error("请求超时"));
            });

            req.on("error", reject);
        });
    }
}
