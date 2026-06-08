import "reflect-metadata";

import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const mockPipelineJob = {
        schedule: vi.fn(),
        save: vi.fn()
    };

    mockPipelineJob.schedule.mockReturnValue(mockPipelineJob);

    return {
        mockPipelineJob,
        mockAgendaEvery: vi.fn(async () => mockPipelineJob),
        mockAgendaNow: vi.fn()
    };
});

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
        every: mocks.mockAgendaEvery,
        now: mocks.mockAgendaNow,
        create: vi.fn(),
        define: vi.fn(),
        jobs: vi.fn(),
        ready: Promise.resolve(),
        start: vi.fn()
    }
}));

vi.mock("@root/common/scheduler/jobUtils", () => ({
    cleanupStaleJobs: vi.fn(),
    scheduleAndWaitForJob: vi.fn()
}));

vi.mock("@root/common/di/container", () => ({
    registerConfigManagerService: vi.fn()
}));

vi.mock("@root/common/services/config/ConfigManagerService", () => ({
    default: { getCurrentConfig: vi.fn() }
}));

vi.mock("@root/common/util/lifecycle/bootstrap", () => ({
    bootstrap: vi.fn(() => undefined),
    bootstrapAll: vi.fn()
}));

import { TaskHandlerTypes } from "@root/common/scheduler/@types/Tasks";

import { schedulePipelineIntervalWithStartupRun } from "../src/index";

describe("schedulePipelineIntervalWithStartupRun", () => {
    it("启动立即执行应复用唯一周期任务，不应额外插入一次性 RunPipeline", async () => {
        await schedulePipelineIntervalWithStartupRun(30);

        expect(mocks.mockAgendaEvery).toHaveBeenCalledWith("30 minutes", TaskHandlerTypes.RunPipeline, undefined, {
            skipImmediate: true
        });
        expect(mocks.mockPipelineJob.schedule).toHaveBeenCalledWith(expect.any(Date));
        expect(mocks.mockPipelineJob.save).toHaveBeenCalledTimes(1);
        expect(mocks.mockAgendaNow).not.toHaveBeenCalled();
    });
});
