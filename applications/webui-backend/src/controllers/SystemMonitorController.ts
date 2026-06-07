import { Request, Response } from "express";
import { injectable, inject } from "tsyringe";

import { TOKENS } from "../di/tokens";
import { SystemMonitorService } from "../services/SystemMonitorService";

@injectable()
export class SystemMonitorController {
    constructor(@inject(TOKENS.SystemMonitorService) private systemMonitorService: SystemMonitorService) {}

    public getLatestStats = async (req: Request, res: Response): Promise<void> => {
        const stats = this.systemMonitorService.getLatestStats();

        res.json({ success: true, data: stats });
    };

    public getStatsHistory = async (req: Request, res: Response): Promise<void> => {
        const history = this.systemMonitorService.getStatsHistory();

        res.json({ success: true, data: history });
    };
}
