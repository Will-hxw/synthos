import "reflect-metadata";
import { ImDbAccessService } from "@root/common/services/database/ImDbAccessService";
import { AgcDbAccessService } from "@root/common/services/database/AgcDbAccessService";
import Logger from "@root/common/util/Logger";
import { agendaInstance } from "@root/common/scheduler/agenda";
import {
    registerConfigManagerService,
    registerCommonDBService,
    registerImDbAccessService,
    registerAgcDbAccessService
} from "@root/common/di/container";
import { bootstrap, bootstrapAll } from "@root/common/util/lifecycle/bootstrap";

import {
    registerTaskHandlers,
    getPreprocessTaskHandler,
    registerAccumulativeSplitter,
    registerTimeoutSplitter
} from "./di/container";

const LOGGER = Logger.withTag("🏭 preprocessor-root-script");

/**
 * Preprocessing 应用入口类
 * 负责初始化 DI 容器、数据库服务和任务处理器
 */
@bootstrap
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class PreprocessingApplication {
    /**
     * 应用主入口
     */
    public async main(): Promise<void> {
        // 1. 初始化 DI 容器 - 注册基础服务
        registerConfigManagerService();
        registerCommonDBService();

        // 2. 初始化数据库服务
        const imDbAccessService = new ImDbAccessService();

        await imDbAccessService.init();
        const agcDbAccessService = new AgcDbAccessService();

        await agcDbAccessService.init();

        // 3. 注册数据库访问服务到 DI 容器
        registerImDbAccessService(imDbAccessService);
        registerAgcDbAccessService(agcDbAccessService);

        // 4. 注册分割器
        registerAccumulativeSplitter();
        registerTimeoutSplitter();

        // 5. 注册任务处理器
        registerTaskHandlers();

        // 6. 获取任务处理器并注册到 Agenda
        const preprocessTaskHandler = getPreprocessTaskHandler();

        await preprocessTaskHandler.register();

        LOGGER.success("Ready to start agenda scheduler");
        await agendaInstance.start(); // 启动调度器
    }
}

// 启动应用
bootstrapAll();
