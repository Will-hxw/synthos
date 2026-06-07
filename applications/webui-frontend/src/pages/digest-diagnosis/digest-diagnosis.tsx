import type { GroupDetailsRecord } from "@/types/group";
import type { DigestCoverageResult } from "@/api/digestCoverageApi";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Card, CardBody, CardHeader, Input, Select, SelectItem, Spinner } from "@heroui/react";
import { RefreshCw } from "lucide-react";

import { getGroupDetails } from "@/api/basicApi";
import { getDigestCoverage } from "@/api/digestCoverageApi";
import { title } from "@/components/primitives";
import QQAvatar from "@/components/QQAvatar";
import DefaultLayout from "@/layouts/default";
import { Notification } from "@/util/Notification";

import { SummaryCard, SessionTable, UnassignedMessageTable, formatTimestamp } from "./components/DigestCoverageTables";

const DEFAULT_DETAIL_LIMIT = 100;
const DEFAULT_TIME_START = new Date("2024-01-01T00:00:00").getTime();

interface InitialState {
    selectedGroupId: string;
    startInput: string;
    endInput: string;
    shouldAutoQuery: boolean;
}

const pad = (value: number): string => String(value).padStart(2, "0");

const formatDatetimeInput = (timestamp: number): string => {
    const date = new Date(timestamp);

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const parseUnixMsParam = (value: string | null): number | null => {
    if (!value) {
        return null;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < 0) {
        return null;
    }

    return parsed;
};

const parseDatetimeInput = (value: string): number | null => {
    if (!value) {
        return null;
    }

    const timestamp = new Date(value).getTime();

    if (!Number.isFinite(timestamp) || timestamp < 0) {
        return null;
    }

    return timestamp;
};

const getInitialState = (searchParams: URLSearchParams): InitialState => {
    const now = Date.now();
    const parsedStart = parseUnixMsParam(searchParams.get("timeStart"));
    const parsedEnd = parseUnixMsParam(searchParams.get("timeEnd"));
    const hasValidRange = parsedStart !== null && parsedEnd !== null && parsedEnd >= parsedStart;
    const timeEnd = hasValidRange ? parsedEnd : now;
    const timeStart = hasValidRange ? parsedStart : DEFAULT_TIME_START;

    return {
        selectedGroupId: searchParams.get("groupId") || "",
        startInput: formatDatetimeInput(timeStart),
        endInput: formatDatetimeInput(timeEnd),
        shouldAutoQuery: Boolean(searchParams.get("groupId") && hasValidRange)
    };
};

const getGroupLabel = (groups: GroupDetailsRecord, groupId: string): string => {
    const groupName = groups[groupId]?.groupName;

    if (groupName && groupName.trim().length > 0) {
        return `${groupName.trim()} (${groupId})`;
    }

    return groupId;
};

export default function DigestDiagnosisPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialStateRef = useRef<InitialState | null>(null);

    if (!initialStateRef.current) {
        initialStateRef.current = getInitialState(searchParams);
    }

    const initialState = initialStateRef.current;
    const shouldAutoQueryRef = useRef<boolean>(initialState.shouldAutoQuery);
    const [groups, setGroups] = useState<GroupDetailsRecord>({});
    const [selectedGroupId, setSelectedGroupId] = useState<string>(initialState.selectedGroupId);
    const [startInput, setStartInput] = useState<string>(initialState.startInput);
    const [endInput, setEndInput] = useState<string>(initialState.endInput);
    const [result, setResult] = useState<DigestCoverageResult | null>(null);
    const [isGroupsLoading, setIsGroupsLoading] = useState<boolean>(false);
    const [isQueryLoading, setIsQueryLoading] = useState<boolean>(false);
    const requestSeqRef = useRef<number>(0);

    const groupIds = useMemo(() => Object.keys(groups), [groups]);
    const parsedTimeStart = parseDatetimeInput(startInput);
    const parsedTimeEnd = parseDatetimeInput(endInput);
    const hasValidTimeRange = parsedTimeStart !== null && parsedTimeEnd !== null && parsedTimeEnd >= parsedTimeStart;

    useEffect(() => {
        const fetchGroups = async () => {
            setIsGroupsLoading(true);
            try {
                const response = await getGroupDetails();

                if (response.success) {
                    setGroups(response.data);
                    const configuredGroupIds = Object.keys(response.data);

                    if (!selectedGroupId && configuredGroupIds.length > 0) {
                        setSelectedGroupId(configuredGroupIds[0]);
                    }
                } else {
                    Notification.error({ title: "群组加载失败", description: response.message || "无法获取群组列表" });
                }
            } catch (error) {
                Notification.error({
                    title: "群组加载失败",
                    description: error instanceof Error ? error.message : String(error)
                });
            } finally {
                setIsGroupsLoading(false);
            }
        };

        void fetchGroups();
    }, []);

    useEffect(() => {
        if (!hasValidTimeRange) {
            return;
        }

        const nextParams = new URLSearchParams();

        if (selectedGroupId) {
            nextParams.set("groupId", selectedGroupId);
        }
        nextParams.set("timeStart", String(parsedTimeStart));
        nextParams.set("timeEnd", String(parsedTimeEnd));
        setSearchParams(nextParams, { replace: true });
    }, [hasValidTimeRange, parsedTimeStart, parsedTimeEnd, selectedGroupId, setSearchParams]);

    const fetchDiagnosis = async () => {
        if (!selectedGroupId) {
            Notification.error({ title: "缺少群组", description: "请选择要诊断的群组" });
            return;
        }

        if (!hasValidTimeRange || parsedTimeStart === null || parsedTimeEnd === null) {
            Notification.error({ title: "时间范围无效", description: "请确认开始时间不晚于结束时间" });
            return;
        }

        const requestId = requestSeqRef.current + 1;

        requestSeqRef.current = requestId;
        setIsQueryLoading(true);
        try {
            const response = await getDigestCoverage({
                groupId: selectedGroupId,
                timeStart: parsedTimeStart,
                timeEnd: parsedTimeEnd,
                detailLimit: DEFAULT_DETAIL_LIMIT
            });

            if (requestSeqRef.current !== requestId) {
                return;
            }

            if (response.success) {
                setResult(response.data);
            } else {
                Notification.error({ title: "诊断失败", description: response.message || "接口返回失败" });
            }
        } catch (error) {
            if (requestSeqRef.current !== requestId) {
                return;
            }

            Notification.error({
                title: "诊断失败",
                description: error instanceof Error ? error.message : String(error)
            });
        } finally {
            if (requestSeqRef.current === requestId) {
                setIsQueryLoading(false);
            }
        }
    };

    useEffect(() => {
        if (!shouldAutoQueryRef.current || !selectedGroupId || groupIds.length === 0) {
            return;
        }

        shouldAutoQueryRef.current = false;
        void fetchDiagnosis();
    }, [groupIds.length, selectedGroupId]);

    return (
        <DefaultLayout>
            <section className="flex flex-col gap-4 py-8 md:py-10">
                <div className="flex flex-col items-center justify-center gap-4">
                    <h1 className={title()}>漏总结诊断</h1>
                    <p className="max-w-2xl text-center text-default-600">按群组和时间范围只读核对原始消息、session 和 AI 摘要结果的覆盖情况</p>
                </div>

                <Card className="mt-6">
                    <CardHeader>
                        <h2 className="px-3 text-lg font-bold">诊断条件</h2>
                    </CardHeader>
                    <CardBody>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,1fr)_220px_220px_auto] md:items-end">
                            <Select
                                isLoading={isGroupsLoading}
                                label="群组"
                                placeholder="选择群组"
                                selectedKeys={selectedGroupId ? [selectedGroupId] : []}
                                size="sm"
                                onSelectionChange={keys => {
                                    const selected = keys === "all" ? undefined : Array.from(keys)[0];

                                    setSelectedGroupId(typeof selected === "string" ? selected : "");
                                }}
                            >
                                {groupIds.map(groupId => (
                                    <SelectItem key={groupId} startContent={<QQAvatar qqId={groupId} type="group" />} textValue={getGroupLabel(groups, groupId)}>
                                        {getGroupLabel(groups, groupId)}
                                    </SelectItem>
                                ))}
                            </Select>
                            <Input label="开始时间" size="sm" type="datetime-local" value={startInput} onValueChange={setStartInput} />
                            <Input label="结束时间" size="sm" type="datetime-local" value={endInput} onValueChange={setEndInput} />
                            <Button color="primary" isLoading={isQueryLoading} startContent={!isQueryLoading && <RefreshCw size={16} />} onPress={fetchDiagnosis}>
                                开始诊断
                            </Button>
                        </div>
                        {!hasValidTimeRange && <p className="mt-3 text-sm text-danger">时间范围无效，请确认开始时间不晚于结束时间。</p>}
                    </CardBody>
                </Card>

                {isQueryLoading && !result ? (
                    <div className="flex h-48 items-center justify-center">
                        <Spinner label="正在诊断" />
                    </div>
                ) : result ? (
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <SummaryCard label="原始消息" value={result.rawMessages.totalCount} />
                            <SummaryCard label="未分配消息" tone={result.rawMessages.unassignedCount > 0 ? "warning" : "success"} value={result.rawMessages.unassignedCount} />
                            <SummaryCard label="命中 session" value={result.sessions.totalCount} />
                            <SummaryCard label="已覆盖 session" tone="success" value={result.sessions.coveredCount} />
                            <SummaryCard label="未摘要 session" tone={result.sessions.pendingCount > 0 ? "warning" : "success"} value={result.sessions.pendingCount} />
                            <SummaryCard label="近期失败" tone={result.sessions.recentFailedCount > 0 ? "danger" : "success"} value={result.sessions.recentFailedCount} />
                            <SummaryCard label="已 stale" tone={result.sessions.staleCount > 0 ? "warning" : "success"} value={result.sessions.staleCount} />
                            <SummaryCard label="近期处理中" value={result.sessions.recentProcessingCount} />
                        </div>

                        <Card>
                            <CardBody className="gap-2 text-sm text-default-600">
                                <p>
                                    诊断时间：{formatTimestamp(result.generatedAt)}；stale 判定阈值：{formatTimestamp(result.staleBefore)}；明细上限：每类 {result.detailLimit} 条。
                                </p>
                                <p>
                                    查询范围内消息时间：{formatTimestamp(result.rawMessages.timeStart)} 至 {formatTimestamp(result.rawMessages.timeEnd)}。
                                </p>
                            </CardBody>
                        </Card>

                        <UnassignedMessageTable result={result} />
                        <SessionTable category={result.pendingSessions} titleText="未摘要 session" />
                        <SessionTable category={result.recentFailedSessions} titleText="近期 failed session" />
                        <SessionTable category={result.staleSessions} titleText="已 stale session" />
                    </div>
                ) : (
                    <Card>
                        <CardBody className="py-12 text-center text-default-500">选择群组和时间范围后点击“开始诊断”。</CardBody>
                    </Card>
                )}
            </section>
        </DefaultLayout>
    );
}
