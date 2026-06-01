# Synthos — Bug 审查报告（第三轮）

---

## 二、高严重度（影响数据完整性 / 核心功能不可用）

### H1. GenerateEmbedding taskIds 未去重，同一 topic 可能被重复嵌入写入 [已核验]

`applications/ai-model/src/tasks/GenerateEmbedding.ts:78`

- `allTopicIds = digestResults.map(r => r.topicId)`：若同一 topicId 出现在多个 session 的 digestResults 中（幂等提交 commitSessionDigest 会先删旧再插新，但旧行和新行的 topicId 相同），`allTopicIds` 会包含重复 ID。
- `filterWithoutEmbedding` 会返回所有未嵌入的 ID（含重复），导致同一 topic 被嵌入两次 → `storeEmbeddings` 中 `_doDeleteEmbedding` 会先删旧的再插新的，虽然不会产生脏数据，但重复嵌入浪费算力且第二批的向量 rowid 与 mapping 不一致时可能产生孤儿记录。
- 类别 1/2。

### H2. GenerateEmbedding 批内单条 embedding 异常导致整批跳过，已嵌入的 topic 产生孤儿 vec 行 [已核验]

`applications/ai-model/src/tasks/GenerateEmbedding.ts:116-131`

- 批量 `embedBatch` 成功后，`storeEmbeddings` 在事务内逐条插入。若某条 `embedding.length !== dimension` 抛错，事务回滚 → 整批跳过。但 `embedBatch` 已通过校验（:71-82），此场景概率低。
- 真正的问题：`catch(error)` 捕获所有错误后跳过整批，但 `embedBatch` 返回的 embeddings 数组与 `currentBatchTopicIds` 按 index 对齐。如果 Ollama 返回的向量维度正确但值为 NaN/Infinity（EmbeddingService 只校验长度不校验值域），`storeEmbeddings` 的 `insertVec.run(embedding)` 会静默写入无效向量 → 后续搜索结果中该 topic 的 distance 为 NaN → `l2DistanceToRelevance(NaN)` 返回 0，用户看不到该结果但向量库已被污染。
- 类别 1/3。

### H3. ReportService checkReadStatus 逐条 await isReportRead（N+1） [已核验]

`applications/webui-backend/src/services/ReportService.ts:157-162`

- `for (const reportId of reportIds) { readStatus[reportId] = await this.readStatusManager.isReportRead(reportId) }`：逐条串行读 KVStore。当日报列表返回 20+ 条时，每次刷新页面都要串行等待 20+ 次 KVStore 读取，拖慢日报列表接口。
- 类别 2。

### H4. SystemMonitorController 返回裸对象，破坏全局 `{success, data}` 响应约定 [已核验]

`applications/webui-backend/src/controllers/SystemMonitorController.ts:10-19`

- `getLatestStats` 返回 `res.json(stats || {})`，`getStatsHistory` 返回 `res.json(history)`，均未包装 `{success: true, data: ...}`。前端若按统一约定解析响应（检查 `success` 字段），会误判为请求失败。
- `getStatsHistory` 返回内部可变数组引用（`this.statsHistory`），外部修改会影响内部状态；且无分页，300 条全量返回，数据量大时响应体积膨胀。
- 类别 1/2。

### H5. SemanticRater.scoreTopics 用 Math.max(...posSims) 对关键词列表展开 [已核验]

`applications/ai-model/src/misc/SemanticRater.ts:217,227`

- `Math.max(...posSims)` 和 `Math.max(...negSims)`：当用户配置大量兴趣关键词时（>65536 个，极端但理论可能），`Math.max(...arr)` 会触发 `RangeError: Maximum call stack size exceeded`。虽然当前业务 unlikely，但 `scoreTopics` 是公共方法。
- 类别 1。

### H6. LLMInterestEvaluation KV Store 逐条串行 await get/put/del [已核验]

`applications/ai-model/src/tasks/LLMInterestEvaluationAndNotification.ts:230-243,258-271,134-141,173-176,189-197`

- `_filterUnevaluatedTopics` 和 `_filterUnnotifiedTopics` 对每个 topic 逐条 `await kvStore.get(topicId)`，串行 IO。评估标记写入、通知标记写入、回滚标记删除也是逐条串行。
- 100 个未评估话题需要 100 次串行 KVStore 读取 → 100 次串行写入 → 100 次串行通知读取 → ... 整体延迟叠加。
- 类别 2。

### H7. GenerateReport 每次创建 TextGeneratorService 新实例但只 dispose 最后一个 [已核验]

`applications/ai-model/src/tasks/GenerateReport.ts:31,225`

- `this.textGeneratorService` 是通过 DI 注入的单例，但 `this.textGeneratorService.dispose()` 在:225 被调用。如果多个报告任务并发（虽然 agenda concurrency=1），dispose 会清空模型缓存，影响其他正在使用该服务的任务。即使不并发，单例被 dispose 后下次任务仍从 DI 拿到同一实例但内部状态已清空（models Map 为空，activeModel 为 null），需依赖 `useModel` 懒加载恢复，但 `mustInitBeforeUse` 装饰器可能在 dispose 后再次调用时拒绝访问。
- 类别 1。

---

## 三、中严重度

| 编号 | 位置 | 问题 | 类别 |
|------|------|------|------|
| M1 | `QQProvider.ts:511` | groupId 拼接未参数化：`AND "peerUin" = ${groupId}` 直接字符串插值，虽为内部调用但违反参数化绑定惯例，若 groupId 含特殊字符可导致 SQL 异常 | 1 |
| M2 | `QQProvider.ts:589-596` | 消息正文为空时仍保留 processedMsg 对象但仅 debug 日志不 push 到 messages → 整条消息被静默丢弃。纯 emoji/不支持元素的消息正文为空但含引用内容时，引用内容也一并丢失 | 3 |
| M3 | `ImDbAccessService.ts:257-258` | `getSessionTimeDuration` 中 `Math.min(...validResults.map(...))` / `Math.max(...)` 对大 session 展开有 RangeError 风险（虽然该查询只返回一行，此处安全，但 style 不一致） | 1 |
| M4 | `ChatMessageService.getSessionTimeDurations` | 直接代理到 `ImDbAccessService.getSessionTimeDurations`，已批量化（bug2 中 H8 已修复）。此条确认已修复。 | — |
| M5 | `AgentController.ts:56-63` | SSE 409 并发拒绝用 `res.json()` 返回普通 JSON，与 SSE `event:error` 帧结构不一致。前端 SSE 解析器按 `text/event-stream` 解析，收到普通 JSON 会解析失败/无反馈，用户看不到"对话正在运行"提示 | 4 |
| M6 | `LogsService.ts:89-91` | `nextBefore = oldest.timestamp - 1`：同毫秒日志跨分页边界时，同戳剩余行可能漏读（`< nextBefore` 严格小于，而 `-1` 使同毫秒的行被排除） | 1 |
| M7 | `webui-frontend AgentChat.tsx` | 流式 token 通过 RAF 批处理（flushTokenBuffer），但 `useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])` 中 `messages` 引用每帧都变（map 产生新数组），导致每帧触发 `scrollToBottom`。用户上滚阅读时 `shouldAutoScrollRef` 虽阻止了实际滚动，但每帧仍执行 scrollIntoView 调用和判断 | 2 |
| M8 | `webui-frontend useAskState.ts:72-83` | ask 模式流式输出无批处理（与 AgentChat 的 RAF 方案不同），每个 content chunk 都触发 `setAskResponse` + React 重渲染 + MarkdownRenderer 完整重解析，长回答时严重卡顿 | 2/4 |
| M9 | `webui-frontend ResponsivePopover.tsx:39` | 渲染路径中直接调用 `setViewportScale(90)` 副作用，违反 React 纯函数渲染原则，每次 re-render 且 isSmallScreen=true 都执行，应移入 `useEffect` | 1 |
| M10 | `webui-frontend useTopicStatus (ai-chat):31-36` | `toggleFavorite` 只翻转本地 favoriteTopics 状态但未调用 API 持久化，刷新页面后收藏状态丢失（对比 latest-topics.tsx 和 reports/hooks/useTopicStatus 都有 API 调用） | 1 |
| M11 | `webui-frontend latest-topics.tsx:355-388` | `markAsRead` 先 `setTopics(prev => prev.filter(...))` 乐观删除，再 `await fetchLatestTopics({ silent: true })` 回填。两次 setState 间有异步间隔，且服务端数据可能尚未更新导致条目闪烁回弹 | 1/4 |
| M12 | `webui-frontend agentTrpcClient.ts:30-48` | tRPC WebSocket 客户端无重连配置（无 `retryDelayMs`/`maxRetries`），网络抖动或服务端重启后 WS 断开不会自动重连，后续所有 askStream 订阅静默失败，需刷新页面 | 4 |
| M13 | `webui-frontend SearchInputBar.tsx:51` | `parseInt(e.target.value) || 10`：输入 "0" 时 parseInt 返回 0（falsy），被静默篡改为 10；输入 "abc" 同样静默回退为 10，无错误提示 | 3/4 |
| M14 | `webui-frontend NumberInput.tsx:31` | `parseFloat(e.target.value) || 0`：清空输入框时 NaN||0 立即归零，用户无法临时清空修改（如想把 100 改成 200） | 4 |
| M15 | `webui-frontend ai-digest.tsx:242-253` | "导出为PDF/Word/Markdown" 三个按钮绑定了 onPress 但无实际处理函数，点击无反应也无禁用提示 | 4 |
| M16 | `webui-frontend agentApi.ts:248-260` | `getAgentConversationsPage` 与 `getAgentConversations` 实现完全相同（相同 URL/请求体/参数），重复接口若后续分化修改可能行为不一致 | 1 |
| M17 | `webui-frontend groups.tsx/QQAvatar.tsx` | 群头像和用户头像 URL 使用 `http://` 协议，HTTPS 页面下被浏览器混合内容策略阻止加载，头像全部显示占位图 | 1 |
| M18 | `webui-frontend useSemanticSearch.ts:16-35` | `handleSearch` 无 AbortController 竞态防护，快速连续搜索时先发请求后到覆盖后发正确结果 | 1 |
| M19 | `webui-frontend reports.tsx:306-331` | `openReportDetail` 先 `setSelectedReport(report)` 设置列表级数据，再 `await getReportById(report.reportId)` 获取完整详情覆盖，弹窗打开瞬间显示摘要级数据然后闪烁为详情级数据 | 1/4 |

---

## 四、低严重度（健壮性 / 轻微体验，择机处理）

- `webui-frontend format.ts:1-9`：`formatBytes` 对负数输入未防护，`Math.log(负数)` 返回 NaN → 输出 "NaN undefined"。类别 3。
- `webui-frontend SessionItem.tsx:47-62`：`formatTime` 对 `days >= 7` 只显示月/日不含年份，跨年旧会话无法区分年份。类别 3。
- `webui-frontend TopicPopover.tsx:69`：`handleOpenChange` 非 memoized，导致 `open` callback 每次 render 重建。类别 2。
- `webui-frontend AgentChat.tsx:593-631`：`toolTraces.map` 直接渲染全部工具调用记录，`JSON.stringify(t.toolArgs/toolResult, null, 2)` 无长度限制，大体积结果撑爆 DOM。类别 2。
- `webui-frontend TopicCard/utils.ts:30-41`：`generateColorFromInterestScore` 不限制 interestScore 范围，极端值（score > 1）导致 hue 溢出，颜色不可预测。类别 3。
- `webui-frontend AskPanel.tsx:48-66`：`handleSaveAsImage` 异步操作前手动修改 DOM style，可能与 React 并发渲染冲突。类别 1。
- `webui-frontend EnhancedDetail.tsx:36`：`names.indexOf(part)` 线性查找，长 contributors + 长文本下性能差，应改用 Set。类别 2。
- `webui-frontend baseUrl.ts:6-10`：判断 localhost 不覆盖 `127.0.0.1`、`0.0.0.0`、局域网 IP 直连场景。类别 3。
- `webui-frontend ChatHistorySidebar.tsx:117-140`：`loadSessions` 依赖 `sessions.length`，追加后 callback 重建链。类别 2。
- `webui-frontend TypingText.tsx:43-58`：useEffect 依赖 `onComplete`，若父组件内联函数则打字速度异常。类别 2。
- `ai-model/AISummarize.ts:176`：日志硬编码"并行度=5"已修复为动态取 `maxConcurrentRequests`（对比 bug2 同位置）。确认已修复。
- `SystemMonitorService.ts:28-30`：`getStatsHistory` 返回内部可变数组引用且无分页，300 条全量返回。类别 2/4。
- `PromisifiedSQLite`：无应用层串行队列，但 AgcDbAccessService 已通过 `runExclusive` promise 链串行化写事务（bug2 H3 已修复）。确认已修复。
- `GenerateReport.ts:225`：`this.textGeneratorService.dispose()` 在任务结束时调用，但该服务是 DI 单例，dispose 后其他任务无法使用。应改为不 dispose 或使用独立实例。类别 1。
