/**
 * 日报邮件服务
 * 负责构建和发送日报相关的邮件通知
 */
import "reflect-metadata";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { injectable, inject } from "tsyringe";
import Logger from "@root/common/util/Logger";
import { Report, ReportType } from "@root/common/contracts/report/index";
import { ConfigManagerService } from "@root/common/services/config/ConfigManagerService";
import { EmailService } from "@root/common/services/email/EmailService";
import { COMMON_TOKENS } from "@root/common/di/tokens";

/**
 * 日报邮件服务
 * 处理日报邮件的构建和发送逻辑
 */
@injectable()
class ReportEmailService {
    private _logger: ReturnType<typeof Logger.withTag> | null = null;
    private readonly _markdownRenderer = new MarkdownIt({
        html: false,
        linkify: true
    });

    /**
     * 构造函数
     * @param configManagerService 配置管理服务
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
            this._logger = Logger.withTag("ReportEmailService");
        }

        return this._logger;
    }

    /**
     * 发送日报邮件（自动发送场景）
     * 会检查 config.report.sendEmail 开关
     * @param report 日报数据
     * @returns 是否发送成功
     */
    public async sendReportEmail(report: Report): Promise<boolean> {
        const config = await this.configManagerService.getCurrentConfig();

        // 检查日报邮件发送功能是否启用
        if (!config.report.sendEmail) {
            this.LOGGER.info("日报邮件发送功能未启用，跳过发送");

            return false;
        }

        return this._doSendReportEmail(report);
    }

    /**
     * 手动发送日报邮件
     * 绕过 config.report.sendEmail 开关，但仍检查 config.email.enabled
     * @param report 日报数据
     * @returns 是否发送成功
     */
    public async sendReportEmailManually(report: Report): Promise<boolean> {
        const config = await this.configManagerService.getCurrentConfig();

        // 检查邮件功能是否启用
        if (!config.email.enabled) {
            this.LOGGER.info("邮件功能未启用，无法发送日报邮件");

            return false;
        }

        return this._doSendReportEmail(report);
    }

    /**
     * 执行日报邮件发送
     * @param report 日报数据
     * @returns 是否发送成功
     */
    private async _doSendReportEmail(report: Report): Promise<boolean> {
        // 构建邮件标题
        const subject = this._buildEmailSubject(report);

        // 构建邮件内容
        const html = this._buildEmailHtml(report);

        // 调用通用邮件服务发送（发件人、收件人、重试逻辑由 EmailService 统一处理）
        const success = await this.emailService.sendEmail({ subject, html });

        if (success) {
            this.LOGGER.success(`日报邮件发送成功: ${subject}`);
        } else {
            this.LOGGER.error(`日报邮件发送失败: ${subject}`);
        }

        return success;
    }

    /**
     * 构建邮件标题
     * @param report 日报数据
     * @returns 邮件标题
     */
    private _buildEmailSubject(report: Report): string {
        const startDate = new Date(report.timeStart);
        const dateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;

        if (report.type === "half-daily") {
            const period = startDate.getHours() < 12 ? "上午" : "下午";

            return `[Synthos 半日报] ${dateStr} ${period}`;
        } else if (report.type === "weekly") {
            return `[Synthos 周报] ${dateStr}`;
        } else {
            return `[Synthos 月报] ${dateStr}`;
        }
    }

    /**
     * 构建邮件 HTML 内容
     * @param report 日报数据
     * @returns HTML 格式的邮件内容
     */
    private _buildEmailHtml(report: Report): string {
        const startDate = new Date(report.timeStart);
        const endDate = new Date(report.timeEnd);

        const formatDateTime = (d: Date) =>
            `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

        const reportTypeNameMap: Record<ReportType, string> = {
            "half-daily": "半日报",
            weekly: "周报",
            monthly: "月报"
        };
        const reportTypeName = reportTypeNameMap[report.type];

        const activeGroupsStr =
            report.statistics.mostActiveGroups.length > 0 ? report.statistics.mostActiveGroups.join("、") : "暂无";
        const summaryHtml = report.isEmpty ? "" : this._renderMarkdownSummary(report.summary);

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
        .header h1 { margin: 0; font-size: 24px; }
        .header .period { margin-top: 10px; opacity: 0.9; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .stats { display: flex; gap: 20px; margin-bottom: 30px; flex-wrap: wrap; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; flex: 1; min-width: 150px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .stat-card .label { font-size: 14px; color: #666; }
        .stat-card .value { font-size: 24px; font-weight: bold; color: #333; margin-top: 5px; }
        .summary { background: white; padding: 25px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .summary h2 { margin-top: 0; color: #333; font-size: 18px; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
        .summary-text { color: #555; }
        .summary-text h1 { font-size: 22px; margin: 18px 0 10px; color: #222; }
        .summary-text h2 { font-size: 18px; margin: 16px 0 8px; color: #333; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
        .summary-text h3 { font-size: 16px; margin: 14px 0 8px; color: #333; }
        .summary-text p { margin: 0 0 12px; }
        .summary-text blockquote { margin: 12px 0; padding: 8px 12px; border-left: 4px solid #667eea; background: #f3f4f6; color: #4b5563; }
        .summary-text ul, .summary-text ol { margin: 0 0 12px 22px; padding: 0; }
        .summary-text li { margin: 4px 0; }
        .summary-text hr { border: 0; border-top: 1px solid #e5e7eb; margin: 18px 0; }
        .summary-text code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-family: Consolas, Monaco, monospace; font-size: 13px; }
        .summary-text pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; }
        .summary-text table { border-collapse: collapse; width: 100%; margin: 12px 0; }
        .summary-text th, .summary-text td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
        .summary-text th { background: #f3f4f6; }
        .summary-text a { color: #2563eb; text-decoration: none; }
        .footer { margin-top: 30px; text-align: center; color: #999; font-size: 12px; }
        .empty-notice { background: #fff3cd; color: #856404; padding: 15px; border-radius: 8px; text-align: center; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📰 Synthos ${reportTypeName}</h1>
        <div class="period">
            ${formatDateTime(startDate)} - ${formatDateTime(endDate)}
        </div>
    </div>
    <div class="content">
        <div class="stats">
            <div class="stat-card">
                <div class="label">话题总数</div>
                <div class="value">${report.statistics.topicCount}</div>
            </div>
            <div class="stat-card">
                <div class="label">最活跃群组</div>
                <div class="value" style="font-size: 14px;">${activeGroupsStr}</div>
            </div>
            <div class="stat-card">
                <div class="label">最活跃时段</div>
                <div class="value">${report.statistics.mostActiveHour}:00</div>
            </div>
        </div>
        ${
            report.isEmpty
                ? `
        <div class="empty-notice">
            📭 本时段暂无热门话题讨论
        </div>
        `
                : `
        <div class="summary">
            <h2>📝 综述</h2>
            <div class="summary-text">${summaryHtml}</div>
        </div>
        `
        }
    </div>
    <div class="footer">
        <p>此邮件由 Synthos 系统自动发送，请勿直接回复</p>
        <p>生成时间：${new Date().toLocaleString("zh-CN")}</p>
    </div>
</body>
</html>
        `;
    }

    /**
     * 将日报 Markdown 摘要转换为适合邮件客户端展示的安全 HTML。
     * @param summary Markdown 格式的日报摘要
     * @returns 经过白名单过滤后的 HTML
     */
    private _renderMarkdownSummary(summary: string): string {
        const markdownWithoutHtml = this._stripRawHtmlTags(summary);
        const rawHtml = this._markdownRenderer.render(markdownWithoutHtml);

        return sanitizeHtml(rawHtml, {
            allowedTags: [
                "a",
                "blockquote",
                "br",
                "code",
                "del",
                "em",
                "h1",
                "h2",
                "h3",
                "h4",
                "hr",
                "li",
                "ol",
                "p",
                "pre",
                "s",
                "strong",
                "table",
                "tbody",
                "td",
                "th",
                "thead",
                "tr",
                "ul"
            ],
            allowedAttributes: {
                a: ["href", "target", "rel"]
            },
            allowedSchemes: ["http", "https", "mailto"],
            transformTags: {
                a: (tagName, attribs) => ({
                    tagName,
                    attribs: {
                        ...attribs,
                        target: "_blank",
                        rel: "noopener noreferrer"
                    }
                })
            }
        });
    }

    /**
     * 移除 Markdown 原文中的 HTML 标签，避免危险标签被作为可见源码塞进邮件正文。
     * @param markdown Markdown 原文
     * @returns 移除原始 HTML 标签后的 Markdown
     */
    private _stripRawHtmlTags(markdown: string): string {
        let result = "";
        let index = 0;
        const lowerMarkdown = markdown.toLowerCase();

        while (index < markdown.length) {
            if (markdown[index] !== "<") {
                result += markdown[index];
                index++;
                continue;
            }

            const tag = this._readHtmlTag(markdown, index);

            if (!tag) {
                result += markdown[index];
                index++;
                continue;
            }

            const tagEndIndex = markdown.indexOf(">", index + 1);

            if (tagEndIndex === -1) {
                result += markdown[index];
                index++;
                continue;
            }

            if (!tag.isClosing && (tag.name === "script" || tag.name === "style")) {
                const closeTag = `</${tag.name}>`;
                const closeTagStartIndex = lowerMarkdown.indexOf(closeTag, tagEndIndex + 1);

                if (closeTagStartIndex === -1) {
                    index = tagEndIndex + 1;
                } else {
                    index = closeTagStartIndex + closeTag.length;
                }

                continue;
            }

            index = tagEndIndex + 1;
        }

        return result;
    }

    /**
     * 读取当前位置的 HTML 标签名称。
     * @param markdown Markdown 原文
     * @param tagStartIndex 标签起始下标
     * @returns 标签信息；当前位置不是 HTML 标签时返回 null
     */
    private _readHtmlTag(markdown: string, tagStartIndex: number): { name: string; isClosing: boolean } | null {
        let index = tagStartIndex + 1;

        if (index >= markdown.length) {
            return null;
        }

        if (markdown[index] === "!" || markdown[index] === "?") {
            return { name: "", isClosing: false };
        }

        let isClosing = false;

        if (markdown[index] === "/") {
            isClosing = true;
            index++;
        }

        if (index >= markdown.length || !this._isHtmlTagNameStart(markdown[index])) {
            return null;
        }

        const nameStartIndex = index;

        while (index < markdown.length && this._isHtmlTagNameChar(markdown[index])) {
            index++;
        }

        if (index < markdown.length && !this._isHtmlTagBoundary(markdown[index])) {
            return null;
        }

        return {
            name: markdown.slice(nameStartIndex, index).toLowerCase(),
            isClosing
        };
    }

    /**
     * 判断字符是否可以作为 HTML 标签名首字符。
     * @param char 待判断字符
     * @returns 是否为标签名首字符
     */
    private _isHtmlTagNameStart(char: string): boolean {
        const charCode = char.charCodeAt(0);

        return (charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122);
    }

    /**
     * 判断字符是否可以作为 HTML 标签名后续字符。
     * @param char 待判断字符
     * @returns 是否为标签名字符
     */
    private _isHtmlTagNameChar(char: string): boolean {
        const charCode = char.charCodeAt(0);

        return (
            (charCode >= 65 && charCode <= 90) ||
            (charCode >= 97 && charCode <= 122) ||
            (charCode >= 48 && charCode <= 57) ||
            char === "-" ||
            char === ":"
        );
    }

    /**
     * 判断字符是否为 HTML 标签名后的合法边界。
     * @param char 待判断字符
     * @returns 是否为标签名边界
     */
    private _isHtmlTagBoundary(char: string): boolean {
        return char === ">" || char === "/" || char === " " || char === "\n" || char === "\r" || char === "\t";
    }
}

/**
 * ReportEmailService 实例类型
 * 用于依赖注入时的类型标注
 */
export type IReportEmailService = ReportEmailService;

export { ReportEmailService };
