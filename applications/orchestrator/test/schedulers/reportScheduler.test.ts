import "reflect-metadata";

import { describe, expect, it, vi } from "vitest";

vi.mock("@root/common/util/Logger", () => ({
    default: {
        withTag: () => ({
            debug: vi.fn(),
            info: vi.fn(),
            success: vi.fn(),
            warning: vi.fn(),
            error: vi.fn()
        })
    }
}));

vi.mock("@root/common/scheduler/agenda", () => ({
    agendaInstance: {
        every: vi.fn(),
        define: vi.fn(),
        now: vi.fn()
    }
}));

vi.mock("@root/common/services/config/ConfigManagerService", () => ({
    default: { getCurrentConfig: vi.fn() }
}));

import { calculateHalfDailyTimeRange } from "../../src/schedulers/reportScheduler";

const HALF_DAILY_TIMES = ["08:00", "08:30", "20:00"];

function at(hour: number, minute: number): Date {
    return new Date(2026, 4, 25, hour, minute, 0, 0);
}

describe("calculateHalfDailyTimeRange", () => {
    it("同小时多时间点应精确匹配到对应区间（08:30 → 08:00~08:30）", () => {
        const trigger = at(8, 30);
        const { timeStart, timeEnd } = calculateHalfDailyTimeRange(trigger, HALF_DAILY_TIMES);

        // 旧实现会因 hour 兜底错配到 08:00 那一档，把起点算成前一天 20:00
        expect(timeStart).toBe(at(8, 0).getTime());
        expect(timeEnd).toBe(trigger.getTime());
    });

    it("当天首个时间点应回溯到前一天最后一个时间点（08:00 → 前一天 20:00）", () => {
        const trigger = at(8, 0);
        const { timeStart } = calculateHalfDailyTimeRange(trigger, HALF_DAILY_TIMES);

        const expected = at(20, 0);

        expected.setDate(expected.getDate() - 1);
        expect(timeStart).toBe(expected.getTime());
    });

    it("最后一个时间点应从上一档开始（20:00 → 08:30）", () => {
        const trigger = at(20, 0);
        const { timeStart } = calculateHalfDailyTimeRange(trigger, HALF_DAILY_TIMES);

        expect(timeStart).toBe(at(8, 30).getTime());
    });

    it("cron 触发轻微延迟（08:31）仍归入 08:30 档", () => {
        const trigger = at(8, 31);
        const { timeStart } = calculateHalfDailyTimeRange(trigger, HALF_DAILY_TIMES);

        expect(timeStart).toBe(at(8, 0).getTime());
    });
});
