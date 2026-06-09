# Synthos

> 范围：只考虑功能正确性、性能效率、结果准确度和交互体验问题。安全、权限、泄露、敏感信息、成本控制类问题不纳入。

---

## 链路审查（preprocessing / orchestrator / db-cli / data-provider / ai-model）

审查日期：2026-06-10

> 共同前提：db-cli 迁移的源库即当前生产库。`CommonDBService.init` 固定打开 `common_database.db`，各 DAO 的 `selectAll()` 均为 `SELECT *`，运行时行对象包含表的全部列。

### 严重（数据丢失 / 损坏）

#### S-1 MigrateDB 完全丢失 `ai_digest_sessions` 整张表

- **文件**：`applications/db-cli/src/applications/MigrateDB.ts:48-70`
- **问题**：新库只用文件内联的 `createAGCTableSQL`（仅 `ai_digest_results`），既不创建 `ai_digest_sessions`，也不迁移其数据。而 `common/services/database/constants/InitialSQL.ts` 中的同名 SQL 是包含该表的。
- **后果**：所有摘要会话的终态（success / empty / processing / failed）、`processingStartedAt`、`timeStart` / `timeEnd` 全部丢失。迁移后 `tryClaimSessionForDigest` 会把已完成 session 当作未处理重新摘要，快表 `_canUseLatestTopicMetadataFastPath` 失效。
- **修复**：复用 `InitialSQL` 中完整的建表 SQL，并补充 `ai_digest_sessions` 的全量迁移。

#### S-2 AGC 迁移硬编码丢弃 `modelName` 与 `updateTime`

- **文件**：`applications/db-cli/src/applications/MigrateDB.ts:171-179`
- **问题**：`INSERT INTO ai_digest_results VALUES (..., undefined, undefined)`，注释称“旧库没有该字段”，但源库 schema 与 `storeAIDigestResult` 都写了这两列。
- **后果**：已有的 `modelName`、`updateTime` 被清空。
- **修复**：写入 `data.modelName`、`data.updateTime`。

#### S-3 Interest Score 迁移硬编码丢弃 `scoreV2`~`scoreV5`

- **文件**：`applications/db-cli/src/applications/MigrateDB.ts:196-203`
- **问题**：`INSERT INTO interset_score_results VALUES (data.topicId, data.scoreV1, undefined, undefined, undefined, undefined)`。`selectAll` 为 `SELECT *`，运行时其余分数列均在行对象中。
- **后果**：已存在的 `scoreV2`~`scoreV5` 被清空。
- **修复**：按列迁移 `scoreV1`~`scoreV5` 全部分数。

### 中等（功能性 bug / 健壮性缺陷）

#### M-1 data-provider：单条消息的意外错误拖垮整批拉取

- **文件**：`applications/data-provider/src/providers/QQProvider/QQProvider.ts:1296-1312`（另见 `:1250-1259`）
- **问题**：解析消息行时，非 `PROTOBUF_ERROR` / `EMPTY_VALUE_ERROR` 的错误一律 `throw`；两个调用方 `getMsgByTimeRange:1387-1393`、`getMsgsByMsgIds:179-185` 均为 `for...await` 且无 per-message try/catch。
- **后果**：任意一条消息触发意外错误，整群本次拉取全部失败 → `ProvideData` 任务失败 → orchestrator 终止整条 pipeline。
- **修复**：循环内对单条 `_parseRawGroupMsgRow` 包 try/catch，记录并跳过坏消息，不阻断整批。

#### M-2 MigrateDB 不可重入 / 不幂等

- **文件**：`applications/db-cli/src/applications/MigrateDB.ts:36,75-77,88`
- **问题**：目标文件名固定 `migrated_database.db` 且打开前不清理；建索引用 `CREATE INDEX`（无 `IF NOT EXISTS`），插入无 `ON CONFLICT`。
- **后果**：首次失败后重跑会在建索引或主键冲突处报错回滚，无法安全重试。
- **修复**：索引加 `IF NOT EXISTS`，插入加 `ON CONFLICT`，或开始前重建目标文件。

#### M-3 MigrateDB 目标库连接在出错路径泄漏

- **文件**：`applications/db-cli/src/applications/MigrateDB.ts:34,212`
- **问题**：`newDB` 未 `_registerDisposable`，`dispose()` 只在成功末尾调用；任一阶段抛错后 `newDB` 永不关闭，连接与 WAL 句柄泄漏。
- **修复**：用 `try/finally` 保证 `newDB.dispose()`，或纳入 `_registerDisposable`。

#### M-4 SeekQQNumber / ExecSQL 每次运行泄漏 DB 连接

- **文件**：`applications/db-cli/src/applications/SeekQQNumber.ts:66-68`、`applications/db-cli/src/applications/ExecSQL.ts:19-21`
- **问题**：`new ImDbAccessService()` 后 `init()`，但从不 dispose，也未注册为 disposable，底层 SQLite 连接常驻。
- **修复**：`_registerDisposable(...)` 或 finally 显式 dispose。

#### M-5 大表全量载入内存的 OOM 风险

- **文件**：`applications/db-cli/src/applications/MigrateDB.ts:82,109,165,190`、`applications/db-cli/src/applications/BuildImMessageFtsIndex.ts:28,32-44`
- **问题**：迁移与 FTS 重建均 `selectAll()` 将整张 `chat_messages` 读入内存，FTS 还 `.map` 再复制一份完整数组，峰值两份全量数据。
- **后果**：生产百万级消息时存在内存爆掉风险。
- **修复**：改分页 / 游标流式读取并分批写入。

#### M-6 preprocessing：引用消息缺失会让整批崩溃（潜在 bug）

- **文件**：`applications/preprocessing/src/tasks/PreprocessTask.ts:139-150`
- **问题**：`getRawChatMessageByMsgId`（`common/services/database/ImDbAccessService.ts:1492` 消息不存在即 `throw`）被放进 `Promise.all` 且无 catch。若 `quotedMsgId` 指向不在本地库的消息，整个 `_preprocessRange` 抛错 → Preprocess 任务失败 → pipeline 终止。
- **现实性**：当前 QQ 链路从不写 `quotedMsgId`（仅写 `quotedMsgContent`），故暂不触发；该字段一旦启用即爆。
- **修复**：`getRawChatMessageByMsgId(...).catch(() => undefined)`，缺失时降级。

### 轻微

#### L-1 FTS 空输入时跳过重建，残留旧索引

- **文件**：`common/services/database/fts/ImDbFtsService.ts:119-123`
- **问题**：`rebuildIndex` 在 `messages.length === 0` 时直接 return，不执行 drop + recreate。主库被清空后“重建”仍返回过期索引。
- **修复**：空输入时仍执行 drop + recreate。

#### L-2 ai-model：SQLQueryTool 危险词过滤误杀正常查询

- **文件**：`applications/ai-model/src/agent/tools/SQLQueryTool.ts:148-162`
- **问题**：用 `includes(keyword)` 整串匹配，合法读查询 `... LIKE '%update%'` 因字面量含 `update` 被拒。
- **修复**：按 token 匹配而非子串匹配。

#### L-3 ai-model：PooledTextGeneratorService dispose 时静默丢弃排队任务

- **文件**：`applications/ai-model/src/services/generators/text/PooledTextGeneratorService.ts:74-83,154-210`
- **问题**：dispose 时未启动的排队任务被 `resolve()` 但不触发 `onTaskComplete`，结果数组留 `null`，按完成计数的调用方会出现静默缺口。仅在 dispose 与提交竞态时发生。
- **修复**：dispose 时将未完成任务显式标记为失败并触发回调。

#### L-4 ai-model：agentDB 历史与 LangGraph checkpointer 可能不一致

- **文件**：`applications/ai-model/src/rag/RagRPCImpl.ts:553-621`
- **问题**：LLM 上下文完全由 checkpointer 驱动（`historyMessages` 被显式忽略），而 agentDB 另存一份；其一写失败时 UI 历史与模型实际上下文漂移。
- **修复**：补一致性保障（同事务 / 失败回滚）或文档明确说明。

### 备注

- **orchestrator** 结构稳健（严格串行、每步失败即 `job.fail`、启动清理残留锁），未发现严重 bug。周报 / 月报使用滚动 7 / 30 天窗口而非对齐调度周期，属设计取舍，需评估是否会重叠或漏算。
- QQ 号与时间戳不存在精度问题：QQ 号 9~10 位 `< 2^32`，毫秒时间戳 ~1.7e12 均远小于 `2^53`。
