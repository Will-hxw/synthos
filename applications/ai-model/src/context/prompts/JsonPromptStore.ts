import { ContentUtils } from "../template/ContentUtils";
import { CtxTemplateNode } from "../template/CtxTemplate";

/**
 * JSON 处理提示词存储
 */
export class JsonPromptStore {
    /**
     * 获取 JSON 语法修复提示词
     * @param invalidJson 原始非法 JSON 内容
     * @param parseError JSON.parse 报错信息
     * @returns CtxTemplateNode
     */
    public static async getJsonRepairPrompt(invalidJson: string, parseError: string): Promise<CtxTemplateNode> {
        const root = new CtxTemplateNode();

        root.setChildNodes([
            new CtxTemplateNode()
                .setTitle("你的任务")
                .setContentText(
                    "你是一个 JSON 语法修复助手。请修复下面这段原本应为 JSON 的内容，使其可以被 JSON.parse 直接解析。"
                ),
            new CtxTemplateNode()
                .setTitle("修复要求")
                .setContentText(
                    ContentUtils.orderedList([
                        "只修复 JSON 语法错误，不重新总结、不改写业务含义、不新增事实",
                        "保留原始 JSON 的最外层结构、字段名、字段顺序和已有文本内容",
                        '字符串内容中的英文双引号 " 必须转义为 \\"',
                        "移除 JSON 外部的解释文字、完整 Markdown 代码围栏、残缺 Markdown 代码围栏和单独的 json 语言标识",
                        "修复尾随逗号、未闭合数组、未闭合对象、未闭合字符串、未转义英文双引号和未转义换行控制字符",
                        "不要输出尾随逗号、注释、未转义换行控制字符或多余字段",
                        "最终只输出修复后的 JSON 数组本身，不要输出任何解释"
                    ])
                ),
            new CtxTemplateNode().setTitle("JSON.parse 报错").setContentText(parseError),
            new CtxTemplateNode()
                .setTitle("需要修复的原始内容")
                .setContentText(`<<JSON_BEGIN>>\n${invalidJson}\n<<JSON_END>>`)
        ]);

        return root;
    }
}
