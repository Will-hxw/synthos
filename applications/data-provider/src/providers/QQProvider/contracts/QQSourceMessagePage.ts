export interface QQSourceMessageCursor {
    msgId: string;
    timestamp: number;
}

export interface QQSourceMessagePointer {
    msgId: string;
    timestamp: number;
}

export interface QQSourceMessagePage {
    messages: QQSourceMessagePointer[];
    nextCursor: QQSourceMessageCursor | null;
    reachedEnd: boolean;
    wrapped: boolean;
}
