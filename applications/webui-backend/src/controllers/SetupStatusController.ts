import { Request, Response } from "express";
import { injectable, inject } from "tsyringe";

import { TOKENS } from "../di/tokens";
import { SetupStatusService } from "../services/SetupStatusService";
import { DigestCoverageDiagnosisService } from "../services/DigestCoverageDiagnosisService";
import { GetDigestCoverageSchema } from "../schemas/index";

@injectable()
export class SetupStatusController {
    public constructor(
        @inject(TOKENS.SetupStatusService) private setupStatusService: SetupStatusService,
        @inject(TOKENS.DigestCoverageDiagnosisService)
        private digestCoverageDiagnosisService: DigestCoverageDiagnosisService
    ) {}

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

    /**
     * POST /api/setup-status/digest-coverage
     */
    public async getDigestCoverage(req: Request, res: Response): Promise<void> {
        const params = GetDigestCoverageSchema.parse(req.body);
        const result = await this.digestCoverageDiagnosisService.getDigestCoverage(params);

        res.json({
            success: true,
            data: result
        });
    }
}
