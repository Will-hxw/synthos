/**
 * 兴趣话题邮件服务
 * 负责构建和发送感兴趣话题提醒邮件
 */
import "reflect-metadata";
import { injectable, inject } from "tsyringe";
import Logger from "@root/common/util/Logger";
import { ConfigManagerService } from "@root/common/services/config/ConfigManagerService";
import { EmailService } from "@root/common/services/email/EmailService";
import { AIDigestResult } from "@root/common/contracts/ai-model";
import { COMMON_TOKENS } from "@root/common/di/tokens";

export type InterestEmailSendResult = "sent" | "skipped" | "failed";

/**
 * 兴趣话题邮件服务
 * 处理感兴趣话题提醒邮件的构建和发送逻辑
 */
@injectable()
class InterestEmailService {
    private _logger: ReturnType<typeof Logger.withTag> | null = null;

    /**
     * 构造函数
     * @param configManagerService 配置管理服务
     * @param emailService 邮件服务
     */
    public constructor(
        @inject(COMMON_TOKENS.ConfigManagerService) private configManagerService: ConfigManagerService,
        @inject(COMMON_TOKENS.EmailService) private emailService: EmailService
    ) {}

    /**
     * 获取 Logger 实例（懒加载，避免循环依赖）
     */
    private get LOGGER(): ReturnType<typeof Logger.withTag> {
        if (!this._logger) {
            this._logger = Logger.withTag("InterestEmailService");
        }

        return this._logger;
    }

    /**
     * 发送感兴趣话题提醒邮件
     * @param interestedTopics 感兴趣的话题列表
     * @returns 邮件发送结果
     */
    public async sendInterestTopicsEmail(interestedTopics: AIDigestResult[]): Promise<InterestEmailSendResult> {
        const config = await this.configManagerService.getCurrentConfig();

        // 检查邮件功能是否启用
        if (!config.email.enabled) {
            this.LOGGER.info("邮件功能未启用，跳过发送感兴趣话题提醒邮件");

            return "skipped";
        }

        if (interestedTopics.length === 0) {
            this.LOGGER.info("没有感兴趣的话题，无需发送邮件");

            return "skipped";
        }

        // 构建邮件标题
        const subject = this._buildEmailSubject(interestedTopics.length);

        // 构建邮件内容
        const html = this._buildEmailHtml(interestedTopics);

        // 调用通用邮件服务发送
        const success = await this.emailService.sendEmail({ subject, html });

        if (success) {
            this.LOGGER.success(`感兴趣话题提醒邮件发送成功: ${subject}`);
        } else {
            this.LOGGER.error(`感兴趣话题提醒邮件发送失败: ${subject}`);
        }

        return success ? "sent" : "failed";
    }

    /**
     * 构建邮件标题
     * @param count 感兴趣的话题数量
     * @returns 邮件标题
     */
    private _buildEmailSubject(count: number): string {
        return `【感兴趣话题提醒】发现 ${count} 个您可能感兴趣的话题`;
    }

    /**
     * 构建邮件 HTML 内容
     * @param topics 感兴趣的话题列表
     * @returns HTML 格式的邮件内容
     */
    private _buildEmailHtml(topics: AIDigestResult[]): string {
        const topicsHtml = topics
            .map(
                (topic, index) => `
            <div class="topic-card">
                <div class="topic-number">${index + 1}</div>
                <div class="topic-content">
                    <h3 class="topic-title">${this.emailService.escapeHtml(topic.topic)}</h3>
                    <div class="topic-contributors">
                        <strong>主要参与者：</strong>${this.emailService.escapeHtml(JSON.parse(topic.contributors).join("、"))}
                    </div>
                    <div class="topic-detail">${this.emailService.escapeHtml(topic.detail)}</div>
                </div>
            </div>
        `
            )
            .join("");

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
        .header h1 { margin: 0; font-size: 26px; }
        .header .subtitle { margin-top: 10px; opacity: 0.9; font-size: 14px; }
        .content { background: white; padding: 30px; border-radius: 0 0 10px 10px; }
        .intro { background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 25px; color: #1565c0; }
        .topic-card { background: #fafafa; border-left: 4px solid #f5576c; padding: 20px; margin-bottom: 20px; border-radius: 8px; display: flex; gap: 15px; }
        .topic-number { background: #f5576c; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; flex-shrink: 0; }
        .topic-content { flex: 1; }
        .topic-title { margin: 0 0 12px 0; color: #d32f2f; font-size: 18px; }
        .topic-contributors { margin-bottom: 12px; color: #666; font-size: 14px; }
        .topic-detail { color: #555; white-space: pre-wrap; line-height: 1.8; }
        .footer { margin-top: 30px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #e0e0e0; padding-top: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔔 感兴趣话题提醒</h1>
        <div class="subtitle">发现了 ${topics.length} 个您可能感兴趣的话题</div>
    </div>
    <div class="content">
        <div class="intro">
            💡 以下话题经过智能分析，可能与您的兴趣相关，建议关注
        </div>
        ${topicsHtml}
    </div>
    <div class="footer">
        <p>此邮件由 Synthos 系统自动发送，请勿直接回复</p>
        <p>发送时间：${new Date().toLocaleString("zh-CN")}</p>
    </div>
</body>
</html>
        `;
    }
}

/**
 * InterestEmailService 实例类型
 * 用于依赖注入时的类型标注
 */
export type IInterestEmailService = InterestEmailService;

export { InterestEmailService };
