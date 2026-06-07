import "reflect-metadata";

import type { Report } from "@root/common/contracts/report/index";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportEmailService } from "../services/email/ReportEmailService";

const { mockLogger } = vi.hoisted(() => ({
    mockLogger: {
        debug: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock("@root/common/util/Logger", () => ({
    default: {
        withTag: () => mockLogger
    }
}));

describe("ReportEmailService", () => {
    const mockConfigManagerService = {
        getCurrentConfig: vi.fn()
    };
    const mockEmailService = {
        sendEmail: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockConfigManagerService.getCurrentConfig.mockResolvedValue({
            email: {
                enabled: true
            },
            report: {
                sendEmail: true
            }
        });
        mockEmailService.sendEmail.mockResolvedValue(true);
    });

    it("应将日报 Markdown 摘要渲染为邮件 HTML", async () => {
        const service = new ReportEmailService(mockConfigManagerService as any, mockEmailService as any);

        await service.sendReportEmailManually(
            createReport({
                summary: [
                    "# 日报标题",
                    "",
                    "## 热点概览",
                    "",
                    "### 技术话题",
                    "",
                    "> 引用重点",
                    "",
                    "- 第一项",
                    "- 第二项",
                    "",
                    "**18个话题**",
                    "",
                    "`Map<string, number>`",
                    "",
                    "---"
                ].join("\n")
            })
        );

        const sentHtml = mockEmailService.sendEmail.mock.calls[0][0].html as string;

        expect(sentHtml).toContain("<h1>日报标题</h1>");
        expect(sentHtml).toContain("<h2>热点概览</h2>");
        expect(sentHtml).toContain("<h3>技术话题</h3>");
        expect(sentHtml).toContain("<blockquote>");
        expect(sentHtml).toContain("<li>第一项</li>");
        expect(sentHtml).toContain("<strong>18个话题</strong>");
        expect(sentHtml).toContain("<code>Map&lt;string, number&gt;</code>");
        expect(sentHtml).not.toContain("# 日报标题");
        expect(sentHtml).not.toContain("## 热点概览");
        expect(sentHtml).not.toContain("**18个话题**");
    });

    it("应过滤日报摘要中的危险 HTML 和不安全链接", async () => {
        const service = new ReportEmailService(mockConfigManagerService as any, mockEmailService as any);

        await service.sendReportEmailManually(
            createReport({
                summary: [
                    "# 安全日报",
                    "",
                    '<script>alert("xss")</script>',
                    '<img src="x" onerror="alert(1)">',
                    "[危险链接](javascript:alert(1))",
                    "[安全链接](https://example.com/report)"
                ].join("\n")
            })
        );

        const sentHtml = mockEmailService.sendEmail.mock.calls[0][0].html as string;

        expect(sentHtml).toContain("<h1>安全日报</h1>");
        expect(sentHtml).toContain(
            '<a href="https://example.com/report" target="_blank" rel="noopener noreferrer">安全链接</a>'
        );
        expect(sentHtml).not.toContain("<script>");
        expect(sentHtml).not.toContain("<img");
        expect(sentHtml).not.toContain('onerror="');
        expect(sentHtml).not.toContain('href="javascript:');
    });

    it("空日报应保留空日报提示且不渲染摘要 Markdown", async () => {
        const service = new ReportEmailService(mockConfigManagerService as any, mockEmailService as any);

        await service.sendReportEmailManually(
            createReport({
                isEmpty: true,
                summary: "# 不应渲染"
            })
        );

        const sentHtml = mockEmailService.sendEmail.mock.calls[0][0].html as string;

        expect(sentHtml).toContain("本时段暂无热门话题讨论");
        expect(sentHtml).not.toContain("<h1>不应渲染</h1>");
        expect(sentHtml).not.toContain("# 不应渲染");
    });

    it("邮件关闭时应返回 false 且不调用底层发送服务", async () => {
        mockConfigManagerService.getCurrentConfig.mockResolvedValue({
            email: {
                enabled: false
            },
            report: {
                sendEmail: true
            }
        });

        const service = new ReportEmailService(mockConfigManagerService as any, mockEmailService as any);

        const result = await service.sendReportEmailManually(createReport());

        expect(result).toBe(false);
        expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
    });
});

function createReport(overrides?: Partial<Report>): Report {
    const now = Date.now();

    return {
        reportId: "report-1",
        type: "half-daily",
        timeStart: now - 6 * 60 * 60 * 1000,
        timeEnd: now,
        isEmpty: false,
        summary: "普通日报摘要",
        summaryGeneratedAt: now,
        summaryStatus: "success",
        model: "mock-model",
        statistics: {
            topicCount: 18,
            mostActiveGroups: ["1108636077"],
            mostActiveHour: 22
        },
        topicIds: ["topic-1"],
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
}
