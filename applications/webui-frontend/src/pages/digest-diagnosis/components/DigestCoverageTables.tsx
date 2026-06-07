import type { DigestCoverageResult, DigestCoverageSessionCategory, DigestCoverageSessionDetail, DigestCoverageUnassignedMessageSample } from "@/api/digestCoverageApi";

import { Card, CardBody, CardHeader, Chip, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";

export const formatTimestamp = (timestamp: number | null): string => {
    if (timestamp === null) {
        return "-";
    }

    return new Date(timestamp).toLocaleString();
};

const renderStatusChip = (status: string | null) => {
    if (!status) {
        return <Chip size="sm">无状态</Chip>;
    }

    const color = status === "failed" ? "danger" : status === "processing" ? "warning" : "default";

    return (
        <Chip color={color} size="sm" variant="flat">
            {status}
        </Chip>
    );
};

const getFailReason = (item: DigestCoverageSessionDetail): string => {
    if (item.failReason && item.failReason.trim().length > 0) {
        return item.failReason;
    }

    return "-";
};

export function SummaryCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warning" | "danger" | "success" }) {
    const toneClass = {
        default: "",
        warning: "text-warning",
        danger: "text-danger",
        success: "text-success"
    }[tone];

    return (
        <Card>
            <CardBody className="gap-1">
                <p className="text-sm text-default-500">{label}</p>
                <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
            </CardBody>
        </Card>
    );
}

export function SessionTable({ titleText, category }: { titleText: string; category: DigestCoverageSessionCategory }) {
    const limitedHint = category.count > category.items.length ? `，仅展示前 ${category.items.length} 条` : "";

    return (
        <Card>
            <CardHeader>
                <h2 className="text-lg font-bold">
                    {titleText}（{category.count}
                    {limitedHint}）
                </h2>
            </CardHeader>
            <CardBody>
                <Table aria-label={titleText}>
                    <TableHeader>
                        <TableColumn>Session</TableColumn>
                        <TableColumn>消息数</TableColumn>
                        <TableColumn>时间范围</TableColumn>
                        <TableColumn>状态</TableColumn>
                        <TableColumn>更新时间</TableColumn>
                        <TableColumn>失败原因</TableColumn>
                    </TableHeader>
                    <TableBody emptyContent="无记录">
                        {category.items.map(item => (
                            <TableRow key={item.sessionId}>
                                <TableCell className="font-mono text-xs">{item.sessionId}</TableCell>
                                <TableCell>{item.messageCount}</TableCell>
                                <TableCell>
                                    <div className="flex flex-col gap-1 text-xs">
                                        <span>{formatTimestamp(item.timeStart)}</span>
                                        <span>{formatTimestamp(item.timeEnd)}</span>
                                    </div>
                                </TableCell>
                                <TableCell>{renderStatusChip(item.status)}</TableCell>
                                <TableCell>{formatTimestamp(item.updateTime)}</TableCell>
                                <TableCell className="max-w-[280px] whitespace-normal break-words text-xs">{getFailReason(item)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardBody>
        </Card>
    );
}

export function UnassignedMessageTable({ result }: { result: DigestCoverageResult }) {
    const limitedHint = result.unassignedMessages.count > result.unassignedMessages.items.length ? `，仅展示前 ${result.unassignedMessages.items.length} 条` : "";

    return (
        <Card>
            <CardHeader>
                <h2 className="text-lg font-bold">
                    未分配 session 的消息（{result.unassignedMessages.count}
                    {limitedHint}）
                </h2>
            </CardHeader>
            <CardBody>
                <Table aria-label="未分配 session 的消息样例">
                    <TableHeader>
                        <TableColumn>消息ID</TableColumn>
                        <TableColumn>时间</TableColumn>
                        <TableColumn>发送者</TableColumn>
                        <TableColumn>内容</TableColumn>
                    </TableHeader>
                    <TableBody emptyContent="无未分配消息">
                        {result.unassignedMessages.items.map((item: DigestCoverageUnassignedMessageSample) => (
                            <TableRow key={item.msgId}>
                                <TableCell className="font-mono text-xs">{item.msgId}</TableCell>
                                <TableCell>{formatTimestamp(item.timestamp)}</TableCell>
                                <TableCell>{item.senderNickname || item.senderId || "-"}</TableCell>
                                <TableCell className="max-w-[420px] whitespace-normal break-words text-xs">{item.messageContent || "-"}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardBody>
        </Card>
    );
}
