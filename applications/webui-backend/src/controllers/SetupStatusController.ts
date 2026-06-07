import { Request, Response } from "express";
import { injectable, inject } from "tsyringe";

import { TOKENS } from "../di/tokens";
import { SetupStatusService } from "../services/SetupStatusService";

@injectable()
export class SetupStatusController {
    public constructor(@inject(TOKENS.SetupStatusService) private setupStatusService: SetupStatusService) {}

    /**
     * GET /api/setup-status
     */
    public async getSetupStatus(_req: Request, res: Response): Promise<void> {
        const status = await this.setupStatusService.getSetupStatus();

        res.json({
            success: true,
            data: status
        });
    }
}
