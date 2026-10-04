# Secret Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 superpowers:executing-plans，在当前会话逐项执行，不委派子代理。下面的勾选框用于记录真实执行结果，不能提前勾选。

**Goal:** 交付 README 全范围的卡密提取 MVP，并以真实数据库、浏览器及 Docker Compose 验证。

**Architecture:** Next.js 页面/API 调用 services 业务层，Prisma 访问 PostgreSQL。Secret 加密保存，提取以数据库条件原子更新限次，Caddy 提供生产 HTTPS 入口。

**Tech Stack:** Next.js 16+、TypeScript、Tailwind CSS、shadcn/ui、PostgreSQL 16+、Prisma、Zod、pnpm；Vitest、Playwright 用于测试。

**Spec:** `docs/superpowers/specs/2026-10-03-secret-delivery-design.md`（用户已批准）；需求基线 `README.md`。

## Global Constraints

- 所有文件在 `/Users/pgthinker/StudyCode/GithubProject/secret-delivery/` 内；工具 cwd 曾指向 pi-web，因此 shell 命令必须显式 `cd` 到项目，文件工具使用绝对路径。
- 单条 Secret 最大 32768 UTF-8 字节，单批 5000 条；请求体默认 16 MiB、可配置。保持内部字符、重复输入及有效行顺序。
- 批量以 500 条分块，同事务全成功或全回滚；不能 skipDuplicates。
- Token 为 24 随机字节 Base64URL；AES-256-GCM 使用独立 12 字节 IV；不保存明文 Secret/预览。
- 访问即提取、刷新再次计数；一次加载不重复计数。HEAD/明确预取不能消费额度；管理员 Reveal 不计数。
- 管理员 Session 默认 12 小时；生产 Cookie HttpOnly/Secure/SameSite=Lax；写接口校验 Origin。
- 不上线真实服务器，不引入订单/支付/注册等功能；不提交真实凭据。真实数据库并发验证不可替换为 Mock。
- 已确认由当前会话实现。计划需用户审阅通过才能进入实现。
- 当前目录无 Git 仓库：不擅自初始化或承诺提交。若用户后续启用 Git，每个通过验证的任务可独立提交，只暂存该任务文件。

## Review Focus

1. 多字节内容和缺失/伪造 Content-Length：按实际字节拒绝超限，不能仅看字符数（任务 3）。
2. 解密认证失败、事务中途失败：不得泄露内容、部分入库或错误扣除额度（任务 2、3、4）。
3. Next.js 生产渲染、HEAD、预取和刷新：不得一次加载多计数或因缓存复用绕过计数（任务 4）。
4. 会话过期、跨域写入、未登录 Reveal：必须服务端拒绝，而非只隐藏按钮（任务 2、5）。
5. 导出跨批次顺序、网络断开后的重试和恢复过期链接：顺序稳定，结果不明时不自动重试，恢复不重置额度/期限（任务 3、5）。

## 文件与接口约定

使用 `src/app`、`src/components`、`src/services`、`src/lib`；迁移在 `prisma/`，测试在 `tests/{unit,integration,e2e}`。

`src/services/types.ts` 定义共享类型：
- `EncryptedSecret = { ciphertext: string; iv: string; authTag: string }`。
- `CreateBatchInput = { secrets: string[]; expiresAt: Date | null; maxViews: number | null }`。
- `BatchResult = { total: number; success: number; failed: number; items: { index: number; url: string; preview: string }[] }`。
- `SecretMetadata` 仅含 ID、Token、URL、状态、时间、计数、批次信息和 preview，不含加密字段或完整内容。
- `RetrievalResult` 为 `{ ok: true; content: string; expiresAt: Date | null }` 或 `{ ok: false; reason: 'not_found' | 'disabled' | 'expired' | 'exhausted' }`。
- 服务异常使用 `ServiceError(code, publicMessage)`，由 HTTP 适配层映射状态码；不发送底层错误。解密/数据库故障为通用 500，不伪装成链接不存在。

---

## Task 1：可运行工程与隔离测试环境

**Files:** 新建 `package.json`、`pnpm-lock.yaml`、`tsconfig.json`、`next.config.ts`、`eslint.config.mjs`、`postcss.config.mjs`、`vitest.config.ts`、`playwright.config.ts`、`.gitignore`、`components.json`、`src/app/{layout.tsx,page.tsx,globals.css}`、`src/components/ui/button.tsx`、`compose.test.yml`、`tests/helpers/database.ts`、`tests/unit/smoke.test.ts`。

**Interfaces:** 提供 pnpm scripts：`dev`、`build`、`start`、`lint`、`typecheck`、`test:unit`、`test:integration`、`test:e2e`、`db:migrate`；测试数据库变量 `TEST_DATABASE_URL`，禁止测试回退到生产 DATABASE_URL。

- [ ] 检查 Node、pnpm、Docker/Compose、端口与项目文件；记录版本和工作目录。缺少必要工具时报告，不悄悄更换技术栈。
- [ ] 选择符合版本下限、彼此兼容的稳定依赖并锁定；建立最小工程和测试运行器，不覆盖 README。
- [ ] 写 `smoke.test.ts` 检查基础页面配置和测试环境保护；先运行测试确认目标能力缺失导致失败。
- [ ] 实现测试数据库保护：仅使用专用测试库，清理操作须校验测试库名称，测试样本不使用真实卡密。
- [ ] 运行 `pnpm test:unit`、`pnpm typecheck`、`pnpm lint`、`pnpm build`，预期退出 0；启动独立 PostgreSQL 测试服务并检查健康。

## Task 2：数据库、加密及管理员会话

**Files:** 新建 `prisma/schema.prisma`、`prisma/migrations/*/migration.sql`、`prisma.config.ts`（所选 Prisma 版本需要时）、`src/lib/{env.ts,db.ts,crypto.ts,token.ts,http.ts,errors.ts}`、`src/services/{types.ts,auth.ts}`、`src/app/api/admin/{login,logout}/route.ts`、`tests/unit/{crypto,env,auth}.test.ts`、`tests/integration/auth.test.ts`、`.env.example`。

**Interfaces:** `encryptSecret(content: string): EncryptedSecret`、`decryptSecret(value: EncryptedSecret): string`；`createToken(): string`；`login(password: string): Promise<{ token: string; expiresAt: Date }>`、`requireAdmin(token: string | undefined): Promise<{ id: string }>`、`logout(token: string | undefined): Promise<void>`；`assertSameOrigin(request: Request): void`。

- [ ] 写失败测试：`expect(createToken()).toMatch(/^[A-Za-z0-9_-]{32}$/)`；Unicode 内容加解密相等；篡改 ciphertext/tag 及错误密钥抛错；非法 Base64/非 32 字节密钥被拒绝。
- [ ] 写真实数据库失败测试：会话凭据不以原文落库、12 小时过期、退出失效；错误密码被拒绝；Cookie 属性和跨域登录/写入拒绝；限流状态有界且超限返回 429。
- [ ] 运行 `pnpm test:unit -- tests/unit/crypto.test.ts tests/unit/env.test.ts tests/unit/auth.test.ts` 和目标集成测试，确认失败原因是待实现功能。
- [ ] 建立 Secret/AdminSession 模型与索引、检查约束、迁移；实现配置验证、AES-GCM、Token、固定长度摘要安全密码比较、HMAC 会话摘要、到期/清理和限流。
- [ ] 实现 no-store HTTP 响应、公共错误映射和同源检查；不记录秘密或完整提取 URL。
- [ ] 对专用测试数据库执行迁移，重新运行上述测试及类型/静态检查，预期全部通过。核对数据库没有明文 Secret/会话凭据字段。

## Task 3：有序批量创建及链接导出

**Files:** 新建 `src/lib/{batch-input.ts,request-body.ts,preview.ts,exports.ts}`、`src/services/batches.ts`、`src/app/api/admin/secrets/batch/route.ts`、`tests/unit/{batch-input,request-body,exports,preview}.test.ts`、`tests/integration/batches.test.ts`。

**Interfaces:** `normalizeLines(text: string): string[]`；`parseBatchInput(value: unknown): CreateBatchInput`；`readJsonLimited(request: Request, maxBytes: number): Promise<unknown>`；`createBatch(input: CreateBatchInput): Promise<BatchResult>`；`secretPreview(content: string): string`；`exportLinks(urls: string[], format: 'txt' | 'csv'): string`。

- [ ] 写失败测试：CRLF/CR/LF、空行、trim、内部空格不改、重复值保留；32768 字节成功/32769 拒绝；5000 条成功/5001 拒绝；过去日期/非正数额度拒绝。
- [ ] 写请求体流测试：无 Content-Length、伪造较小长度和流中超过上限均拒绝；解析失败不调用写库服务；有效内容可正常解析。
- [ ] 写导出和预览测试：CSV 首行 `index,url`、序号从 1 开始；TXT 每行一个链接；短于 8 字符完全遮盖，其余最多泄露前 3 字符，结果不含完整样本卡密。
- [ ] 写真实 DB 测试：1000/5000 条全部链接逐条对应输入；相同内容生成不同 Token；注入第二分块失败后新增记录为 0；Token 碰撞有限重试不漏行。记录规模、耗时和环境。
- [ ] 运行上述测试确认红灯，再实现字节限制、Zod 校验、批次/index、事务分块 createMany 和有限 Token 冲突重试。测试故障注入仅在测试边界使用，不暴露 HTTP 调试入口。
- [ ] 重新运行全部目标测试及类型检查，预期通过；创建响应不得含完整 Secret 或加密字段。

## Task 4：原子提取与访客页面

**Files:** 新建 `src/services/retrieval.ts`、`src/app/k/[token]/page.tsx`、`src/app/api/secret/[token]/route.ts`、`src/components/secret-viewer.tsx`、`src/proxy.ts`、`tests/integration/retrieval.test.ts`、`tests/e2e/retrieval.spec.ts`。

**Interfaces:** `retrieveSecret(token: string): Promise<RetrievalResult>`；展示组件只接收一次服务端结果，复制操作不触发再次提取。proxy 仅阻止消费性 HEAD/明确预取，不替代服务鉴权。

- [ ] 写真实 DB 失败测试：maxViews=1 时并发 20 请求恰好 1 成功、viewCount=1；禁用/过期/耗尽/不存在正确区分；坏 tag 回滚计数；无上限正常累加。
- [ ] 运行 `pnpm test:integration -- tests/integration/retrieval.test.ts` 确认红灯；实现事务内条件 UPDATE RETURNING、解密及失败元数据查询，SQL 参数化，不拼接用户输入。
- [ ] 写 Playwright 测试：生产模式首次打开 viewCount=1，刷新为 2；复制不增加计数；HEAD/明确预取不消费；正常 GET 不缓存。四类错误只显示 README 中文提示。
- [ ] 实现动态、no-store 提取页面及 API，共享服务；页面不 fetch 自己的 API，不设置重复 effect。用 Node runtime；关闭内部提取链接预取。
- [ ] 加入复制失败反馈、monospace、长内容换行；在 375px 视口断言 `scrollWidth <= clientWidth`，并检查无后台入口/第三方脚本。
- [ ] 运行真实 DB 测试、`pnpm build` 和 `pnpm test:e2e -- tests/e2e/retrieval.spec.ts`。若框架 HEAD/预取仍执行计数，先修正请求分流再继续，不接受仅单测通过。

## Task 5：管理服务、查询、统计和操作接口

**Files:** 新建 `src/services/{secrets.ts,dashboard.ts}`、`src/app/api/admin/secrets/route.ts`、`src/app/api/admin/secrets/[id]/route.ts`、`src/app/api/admin/secrets/[id]/{reveal,disable,enable}/route.ts`、`src/app/api/admin/secrets/batch/{delete,disable}/route.ts`、`src/app/api/admin/secrets/export/route.ts`、`tests/integration/management.test.ts`。

**Interfaces:** `listSecrets(query: SecretQuery): Promise<{ items: SecretMetadata[]; total: number }>`；`getSecret(id: string): Promise<SecretMetadata>`；`revealSecret(id: string): Promise<string>`；`setSecretStatus(ids: string[], status: 'ACTIVE' | 'DISABLED'): Promise<number>`；`deleteSecrets(ids: string[]): Promise<number>`；`getDashboard(): Promise<{ total: number; active: number; expired: number; disabled: number; views: number }>`；`getExportUrls(ids: string[]): Promise<string[]>`。SecretQuery 定义分页（默认 50）、token/id 查询、状态、创建及到期范围。

- [ ] 写失败测试：未认证对所有管理接口拒绝、Reveal 未认证拒绝、跨域写拒绝；空 ID/过大批量/非法分页日期拒绝。
- [ ] 写 DB 测试：稳定分页、搜索/全部筛选组合、互斥状态统计、总访问量；Reveal 不计数，元数据响应无明文；恢复过期/耗尽链接仍不能提取；硬删除后链接不存在。
- [ ] 写跨批次导出测试，确认按批次创建顺序、batchId、batchIndex 稳定排序；客户端提交的 ID 顺序不改变规则。
- [ ] 运行目标集成测试确认红灯，再实现查询、受控预览、服务和路由鉴权；批量操作只处理明确选中的 ID。
- [ ] 重跑测试及类型/静态检查，预期通过；检查错误响应不含 Prisma/SQL 堆栈或加密字段。

## Task 6：完整管理交互

**Files:** 新建 `src/app/admin/login/page.tsx`、`src/app/admin/(protected)/{layout.tsx,page.tsx}`、`src/app/admin/(protected)/secrets/{page.tsx,create/page.tsx,[id]/page.tsx}`、`src/components/admin/{login-form,batch-form,secrets-table,secret-detail,delete-dialog}.tsx`、必要的 `src/components/ui/` 组件、`tests/e2e/admin.spec.ts`。

**Interfaces:** 页面使用任务 2/3/5 的服务与接口；受保护 route group 不把登录页一起重定向。

- [ ] 写浏览器失败测试：登录 → 生成含重复行的批次 → 查看/复制/导出 → 列表筛选 → 详情 Reveal → 禁用/恢复 → 确认批量删除 → 退出。
- [ ] 写泄露断言：Reveal 点击前 HTML、RSC/网络响应和 DOM 不含完整样本 Secret；点击后方可取得；Reveal 不增加次数。
- [ ] 写交互失败测试：批量提交进行中禁止二次点击，网络结果不明时提示检查批次、不自动重试；取消删除不改 DB；分页选择不暗示全库全选。
- [ ] 运行目标浏览器测试确认缺失页面/行为导致失败，随后实现中文 UI、50 条分页、筛选、日期显示、统计、导出和可访问确认框。生成表单提供永久/30 天/自定义。
- [ ] 提供字段 label、键盘操作、可见焦点和错误提示；复制失败提供手动复制路径，不误报成功。
- [ ] 重跑浏览器测试，检查桌面与 375px 移动端管理页面、提取页面。运行全部单元/集成测试确认无回归。

## Task 7：容器部署及操作文档

**Files:** 新建 `Dockerfile`、`.dockerignore`、`compose.yml`、`compose.local.yml`、`Caddyfile`、`docs/deployment.md`、`docs/operations.md`、`scripts/verify-compose.mjs`；修改 `.env.example`、`README.md`（保留原需求，新增实际状态与使用入口）。

**Interfaces:** app 使用 standalone 输出；迁移容器提供 `pnpm db:migrate`，成功后 app 才启动；PostgreSQL 持久卷；Caddy 生产 HTTPS。本地 override 为 HTTP 提供明确的开发 Cookie 配置，不偷偷关闭生产 Secure。

- [ ] 先写 Compose 验收脚本：检查服务健康、迁移、登录/创建/提取，以及应用和数据库重启后记录保留；首次执行应因缺配置而失败。
- [ ] 实现多阶段镜像和迁移镜像目标；确保 Prisma runtime/生成客户端及迁移均存在，运行时无需重新下载包。应用以非 root 用户运行。
- [ ] 配置健康检查、数据库仅内部访问、日志不暴露提取 URL、请求体代理上限与应用限制协调。
- [ ] 写部署/升级/备份恢复步骤和环境生成命令；明确密钥单独保存、证书签发在用户生产环境进行。演示数据仅合成，临时凭据不写入文档/日志。
- [ ] 运行 `docker compose --env-file .env.local -f compose.yml -f compose.local.yml config --quiet`、同配置 `build`、`up -d`；`.env.local` 为被忽略的临时本地配置。
- [ ] 执行 `node scripts/verify-compose.mjs`，预期全部检查通过；记录镜像、版本和结果。停止测试服务时保留数据卷，禁止未经确认执行 `down -v`。

## Task 8：最终验收与交付

**Files:** 新建 `docs/verification.md`；按检查结果精确修复相关实现/测试，不新增范围。

- [ ] 对照设计第 10 节需求表逐项填入实现路径、测试名称、命令、实际结果和证据位置。
- [ ] 顺序执行 `pnpm lint`、`pnpm typecheck`、`pnpm test:unit`、`pnpm test:integration`、`pnpm build`、`pnpm test:e2e`，预期全部退出 0。测试环境需使用专用 DB。
- [ ] 对变更 TS/TSX 文件执行主动 LSP 诊断；服务不可用时如实记录覆盖范围，以 CLI 类型检查补充，不把空缓存当通过证据。
- [ ] 重跑 Compose 验收，核对默认 Cookie、安全头、未授权/跨域拒绝、无原始 Secret 导出和日志脱敏。
- [ ] 自查 AI 生成代码的资源释放、事务异常、测试清理、占位/TODO、未使用代码及依赖版本兼容性；修复后重跑受影响测试。
- [ ] 汇总 1000/5000 条实测耗时、并发成功计数、浏览器测试和容器结果；不设 README 未要求的 SLA，不隐藏失败或未执行项。
- [ ] 仅在全部目标验收满足后完成持久目标任务并申请整体完成；环境障碍或需求冲突须报告并询问，不用 Mock/跳过替代。

## 计划自查

设计 1–2 由任务 1/8 覆盖；数据/安全由任务 2/5 覆盖；批量由任务 3 覆盖；提取由任务 4 覆盖；后台由任务 5/6 覆盖；部署由任务 7 覆盖。五类 Review Focus 均有对应测试。服务接口与 HTTP/UI 分离，后续步骤沿用本文件接口。持久目标的 design-plan 只在本计划通过用户审阅后完成，其他六个目标里程碑按实际证据更新。
