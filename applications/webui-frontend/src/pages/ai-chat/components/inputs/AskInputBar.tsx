/**
 * AI 问答输入栏
 */
import { Button, Checkbox, cn } from "@heroui/react";
import { Input, Textarea } from "@heroui/input";
import { Send } from "lucide-react";
import { useEffect, useState } from "react";

const TOP_K_MIN = 1;
const TOP_K_MAX = 100;

/**
 * 解析 Top-K 输入框的字符串值。
 * 返回 null 表示空串/非法（调用方应保留中间态、不强行纠正），
 * 否则返回夹到 [TOP_K_MIN, TOP_K_MAX] 的整数。
 */
export function parseTopKInput(raw: string): number | null {
    const parsed = parseInt(raw, 10);

    if (isNaN(parsed)) {
        return null;
    }

    return Math.min(TOP_K_MAX, Math.max(TOP_K_MIN, parsed));
}

interface AskInputBarProps {
    question: string;
    topK: number;
    enableQueryRewriter: boolean;
    askLoading: boolean;
    onQuestionChange: (value: string) => void;
    onTopKChange: (value: number) => void;
    onEnableQueryRewriterChange: (value: boolean) => void;
    onAsk: () => void;
}

export default function AskInputBar({ question, topK, enableQueryRewriter, askLoading, onQuestionChange, onTopKChange, onEnableQueryRewriterChange, onAsk }: AskInputBarProps) {
    // 用本地字符串状态承载输入，允许用户清空/编辑中间态而不被立刻纠正成 100。
    const [topKInput, setTopKInput] = useState(topK.toString());

    // 父级 topK 变化（如从 URL 初始化）时同步显示值
    useEffect(() => {
        setTopKInput(topK.toString());
    }, [topK]);

    const handleTopKChange = (raw: string) => {
        setTopKInput(raw);

        // 仅当输入是合法整数时才提交给父级，空串/非法值保留在本地不纠正
        const clamped = parseTopKInput(raw);

        if (clamped !== null) {
            onTopKChange(clamped);
        }
    };

    // 失焦时回填：空串或非法值则恢复为当前已提交的 topK
    const handleTopKBlur = () => {
        const clamped = parseTopKInput(topKInput);

        if (clamped === null) {
            setTopKInput(topK.toString());

            return;
        }

        setTopKInput(clamped.toString());
        onTopKChange(clamped);
    };

    return (
        <form
            className={cn("relative w-full rounded-medium bg-default-100", "flex flex-col items-start", "transition-border border-2 border-default-300 focus-within:border-primary")}
            onSubmit={e => {
                e.preventDefault();
                onAsk();
            }}
        >
            <Textarea
                className="w-full"
                classNames={{
                    inputWrapper: "!bg-transparent shadow-none",
                    input: "pt-2 pl-3 pb-12 !pr-3 text-medium"
                }}
                maxRows={5}
                minRows={2}
                placeholder="输入你的问题，如：React 18 有哪些新特性？群友们是怎么看的？"
                value={question}
                variant="flat"
                onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onAsk();
                    }
                }}
                onValueChange={onQuestionChange}
            />

            <div className="flex w-full items-center justify-between px-3 pb-3">
                <div className="flex items-center gap-2">
                    Top-K:
                    <Input
                        className="w-35"
                        max={TOP_K_MAX}
                        min={TOP_K_MIN}
                        size="sm"
                        type="number"
                        value={topKInput}
                        variant="bordered"
                        onBlur={handleTopKBlur}
                        onChange={e => handleTopKChange(e.target.value)}
                    />
                    <Checkbox className="ml-2" isSelected={enableQueryRewriter} size="md" onValueChange={onEnableQueryRewriterChange}>
                        查询扩展
                    </Checkbox>
                </div>

                <div className="flex items-center gap-2">
                    <div className="text-xs text-default-400">{question.length > 0 ? `${question.length} 字符` : ""}</div>
                    <Button isIconOnly color={question.trim() ? "primary" : "default"} isDisabled={!question.trim() || askLoading} isLoading={askLoading} size="sm" type="submit">
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </form>
    );
}
