import { MsgType } from "../@types/mappers/MsgType";

export const RETAINED_QQ_MSG_TYPES = [
    MsgType.TEXT,
    MsgType.GROUP_FILE,
    MsgType.VOICE,
    MsgType.VIDEO,
    MsgType.FORWARD_MERGED,
    MsgType.REPLY,
    MsgType.RED_PACKET,
    MsgType.APP_MESSAGE
];

export const RETAINED_QQ_MSG_TYPE_SQL_LIST = RETAINED_QQ_MSG_TYPES.join(", ");

const RETAINED_QQ_MSG_TYPE_SET = new Set<number>(RETAINED_QQ_MSG_TYPES);

export function isRetainedQQMsgType(value: unknown): boolean {
    const msgType = Number(value);

    return Number.isInteger(msgType) && RETAINED_QQ_MSG_TYPE_SET.has(msgType);
}

export function buildQQParseFailurePlaceholder(msgType: number): string {
    return `[${getQQMsgTypeDisplayName(msgType)}解析失败]`;
}

export function buildQQEmptyContentPlaceholder(msgType: number): string {
    return `[${getQQMsgTypeDisplayName(msgType)}暂无可读正文]`;
}

function getQQMsgTypeDisplayName(msgType: number): string {
    switch (msgType) {
        case MsgType.TEXT: {
            return "文本消息";
        }
        case MsgType.GROUP_FILE: {
            return "文件消息";
        }
        case MsgType.VOICE: {
            return "语音消息";
        }
        case MsgType.VIDEO: {
            return "视频消息";
        }
        case MsgType.FORWARD_MERGED: {
            return "合并转发消息";
        }
        case MsgType.REPLY: {
            return "回复消息";
        }
        case MsgType.RED_PACKET: {
            return "红包消息";
        }
        case MsgType.APP_MESSAGE: {
            return "应用消息";
        }
        default: {
            return "业务消息";
        }
    }
}
