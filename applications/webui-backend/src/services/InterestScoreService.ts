/**
 * 兴趣度评分服务
 */
import { injectable, inject } from "tsyringe";
import { InterestScoreDbAccessService } from "@root/common/services/database/InterestScoreDbAccessService";

import { TOKENS } from "../di/tokens";

@injectable()
export class InterestScoreService {
    constructor(
        @inject(TOKENS.InterestScoreDbAccessService)
        private interestScoreDbAccessService: InterestScoreDbAccessService
    ) {}

    /**
     * 根据多个 topicId 获取兴趣度评分结果
     */
    public async getInterestScoreResults(topicIds: string[]) {
        return this.interestScoreDbAccessService.getInterestScoreResults(topicIds);
    }
}
