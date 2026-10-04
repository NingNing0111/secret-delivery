# Secret Delivery MVP 设计

状态：方案已获口头确认；本文待用户审阅。本文不是已实现功能说明。

## 1. 目标与范围

以仓库 README.md 第 1–26 节为需求基线，实现可本地验证、可 Docker Compose 部署的中文卡密批量提取系统。不部署真实服务器，不增加支付、订单、商品、注册、多管理员、RBAC、OAuth 或第三方统计。

用户已确认：
- 打开提取链接立即提取并计数；刷新再次计数，链接扫描器访问也可能消耗额度。
- 单批创建全成功或全回滚。
- 请求体默认最多 16 MiB，可配置；这是独立于单条 32 KiB、单批 5000 条的总体保护。大批长内容需要分批导入；超限明确拒绝而非截断。
- 使用 Next.js 单体全栈、PostgreSQL、Caddy；先审阅设计和实施计划，之后由当前会话实现，不委派子代理。

## 2. 架构

Next.js 16+ App Router、TypeScript、Tailwind CSS、shadcn/ui、Prisma、Zod、pnpm；PostgreSQL 16+。使用 Node.js runtime，不使用 Edge runtime 执行加密或数据库操作。

分层：
- `app/`：管理/访客页面及 HTTP 路由，负责身份校验、参数转换和响应。
- `components/`：表单、表格、复制、确认对话框等交互。
- `services/`：认证、批量创建、查询、提取、管理和导出业务。
- `lib/`：环境校验、数据库客户端、加解密、Token、请求安全和公共错误类型。
- `prisma/`：模型及可复现迁移。
- `tests/`：单元、真实数据库集成和浏览器端到端测试。

页面和 API 使用相同业务服务，不另建后端进程。数据库只能从服务端访问。对外链接使用配置的 PUBLIC_BASE_URL 构建，不信任 Host 请求头。

## 3. 数据模型

Secret 使用 README 最终加密模型：id、唯一 token、ciphertext、iv、authTag、ACTIVE/DISABLED 状态、expiresAt、maxViews、viewCount、lastViewedAt、createdAt、updatedAt。

增加 batchId 和 batchIndex，唯一约束 `(batchId, batchIndex)`，用于恢复批内输入顺序。批次标识不是提取凭据，不增加订单模型。维护 createdAt、status、expiresAt 索引。maxViews 若非空必须为正整数，viewCount 非负。

不存明文 Secret 或其明文预览。管理员分页查询时服务端解密当前页并生成受控预览：最多显示前 3 个字符，其余用固定遮罩表示；不足 8 个字符全部遮盖。预览仍会泄露少量前缀，只发送给已认证管理员。完整内容仅由 Reveal 接口返回。

AdminSession 保存凭据摘要、创建/到期时间；浏览器持有随机凭据，服务端用 SESSION_SECRET 参与 HMAC 摘要。默认会话 12 小时，无自动永久续期；退出删除会话并清 Cookie。过期会话按查询条件拒绝并定期机会性清理，不引入单独调度服务。

## 4. 加密与配置

Token 为 `crypto.randomBytes(24)` 的 Base64URL 编码（192 bit），数据库唯一约束为最终防线。Token 冲突使事务回滚，有限次数重新生成并重试，不能无限重试。

Secret 使用 AES-256-GCM，每条独立随机 12 字节 IV 和认证标签；密钥为环境变量中的 Base64 编码 32 字节值，启动时严格检查。错误密钥或认证失败不返回部分明文，不将底层异常发送给买家。

环境模板包含 DATABASE_URL、ADMIN_PASSWORD、SESSION_SECRET、SECRET_ENCRYPTION_KEY、PUBLIC_BASE_URL 和请求体上限等配置，不提供可用于生产的默认密码或固定密钥。数据库备份与加密密钥必须分别安全保存；丢失密钥无法恢复内容。自动密钥轮换不属于本 MVP。

## 5. 认证和 HTTP 安全

登录页无需会话，其余管理页面和所有管理接口在服务端验证会话。密码先转换为固定长度摘要，再以 timingSafeEqual 比较。登录加入有界的失败限流；MVP 为单应用实例，内存限流不声称支持多副本一致性。

Cookie：HttpOnly、SameSite=Lax、Path=/；生产 Secure，开发本地 HTTP 可关闭 Secure。登录和管理写接口验证 Origin 与 PUBLIC_BASE_URL 同源；未经允许的跨域来源拒绝。Reveal 使用同源浏览器请求，不开放 CORS。

提取、Reveal 和管理敏感响应使用 no-store；禁止静态生成和 ISR 缓存敏感内容。设置 Referrer-Policy: no-referrer、X-Robots-Tag: noindex, nofollow 及适当内容安全策略。不记录卡密、密码、Cookie、请求体和含提取 Token 的完整 URL；反向代理不启用包含这些路径的访问日志。

## 6. 批量创建与导出

前端按 CRLF/CR/LF 归一化换行、trim、忽略空行；服务端再次执行权威校验。不改变内部字符，不去重。每条以 UTF-8 字节长度计，最多 32768 字节，每次最多 5000 条；HTTP 层限制实际读取字节数，不仅依赖 Content-Length。

有效期提供永久、30 天和自定义时间，服务端使用 UTC；拒绝过去时间和非法日期。maxViews 为空表示无限，否则为有界正整数。

处理顺序：完整校验 → 分配批次和零基 index → Token/加密 → 每 500 条 createMany → 同一事务提交。数据库写入前完成主要 CPU 处理，避免占用事务过久。不以 skipDuplicates 静默丢行。

响应保留 total/success/failed/items 和原始有效输入 index；整批成功 failed=0，失败返回明确错误且无新增记录。前端生成期间禁止重复提交；网络断开后提交结果可能不确定，提示先检查最近批次再重试，不声称具备请求幂等性。

生成结果按 index 排序。管理页导出所选记录时按批次创建顺序、批次标识、batchIndex 确定顺序；同批必定保留原顺序。TXT 每行一条 URL；CSV 仅 index,url（导出序号从 1 开始），不含 Secret。文件名使用 secret-links-日期时间。

## 7. 访客提取与并发

`/k/{token}` 动态服务端页面调用一次提取服务，将内容交给纯展示/复制组件；客户端不在 effect 再调用提取接口。提取链接不启用预取。刷新或新请求是新的提取。HEAD 和明确的框架预取请求不得消费额度，实施时须在实际生产构建中验证路由行为。

在数据库事务内执行条件 UPDATE RETURNING：token 匹配、ACTIVE、未过期、尚有额度时 viewCount 加 1 并更新 lastViewedAt，返回加密字段，然后解密；解密失败抛出错误使事务回滚。数据库行锁与条件重检保证最后一次额度只能被一个请求获得。不得先 SELECT 再无条件增加次数。

若无更新行，读取最小元数据区分不存在、禁用、过期、次数耗尽，优先级按上述顺序，不返回内部 ID/堆栈。达到最大次数不改变存储状态。HTTP 响应丢失仍可能已计数，这是访问计数而非可靠消息投递协议。

若保留 `/api/secret/{token}`，它独立调用同一个服务，每次调用也消费一次额度；提取页面不得同时请求它。管理员 Reveal 不增加 viewCount。

访客页面中文、移动优先、monospace、长文本可换行，无后台入口，无第三方脚本。复制失败提供可选中文本及提示，不声称复制成功。

## 8. 管理界面

路由覆盖 `/admin`、`/admin/login`、`/admin/secrets`、`/admin/secrets/create`、`/admin/secrets/{id}`。

仪表盘：总数、Active、Expired、Disabled 和总访问次数。统计互斥：Disabled 优先，其余已过期归 Expired，其余归 Active；Active 不代表仍有剩余额度，列表额外显示次数耗尽提示。

列表默认每页 50 条；token/id 搜索、状态、创建时间范围、过期范围筛选；稳定分页排序为 createdAt 和 id。列表选中仅作用于显式选中的 ID，不暗示跨所有筛选页全选。

详情初始仅含元数据与受控预览，不能把明文藏在 HTML、RSC Payload、data 属性或 CSS 中。点击 Reveal 才发请求。支持单条禁用/恢复/删除、批量禁用/删除；删除二次确认且不可恢复。恢复仅恢复状态，不重置有效期或查看次数。

## 9. 部署

多阶段 Dockerfile 构建 Next.js standalone。Compose 包含 app、PostgreSQL、Caddy，以及受控的一次性数据库迁移步骤；应用启动依赖数据库健康及迁移成功。PostgreSQL 使用持久卷，不向公网暴露端口。

提供本地 HTTP 验证方式以及生产域名 HTTPS 配置。生产证书签发由使用者在真实环境执行，本次不操作服务器。文档包括环境生成、迁移、启动、升级、备份/恢复、密钥保存和故障诊断。不把删除数据卷作为常规重启步骤。

## 10. 需求与验证对应

| README | 实现与验收 |
| --- | --- |
| 1–4 产品/技术/角色 | 单体全栈、单管理员及无登录访客流程；范围检查 |
| 5–6 批量流程/页面 | 输入规范化、脱敏、保序、有效期和额度表单；单元/浏览器测试 |
| 7–8 TXT/CSV | 格式、序号、排序、无原始 Secret 的内容断言 |
| 9–10 提取/异常 | 浏览器真实提取、复制、移动布局、四类错误 |
| 11–13 Token/模型/加密 | Token 格式及唯一约束、加解密/篡改测试、落库无明文 |
| 14 计数 | 真实 PostgreSQL 并发竞争，maxViews=1 仅一个成功；页面单次加载与刷新测试 |
| 15–19 管理 | 统计、50 条分页、筛选、Reveal 前无明文、禁用恢复及确认删除 |
| 20 认证 | 安全比较、会话到期/注销、Cookie、未授权页面/API、来源保护 |
| 21–22 API/Batch | Zod 参数验证、服务层分离、index/响应契约测试 |
| 23 性能 | 真实数据库运行 1000/5000 条，核对全部记录顺序，记录环境和耗时，无虚设 SLA |
| 24–25 限制/重复 | UTF-8 字节边界、条数/请求体超限、空行/空格、不去重测试 |
| 26 已提供安全范围 | 密码学随机 Token；不臆造缺失章节 |
| 目标补充部署验收 | 实际镜像构建、Compose 启动/健康、迁移、重启数据保留 |

完成前实际运行类型检查、静态检查、单元/集成/E2E 测试和生产构建，保留命令与结果摘要。真实数据库并发测试不得由 Mock 替代。无法运行的关键验收明确披露，停止受阻部分并询问用户，不标记整体完成。

## 11. 后续批准关口

本文获用户审阅批准后，编写逐步实施计划（测试先行、依赖顺序、命令和验收证据），再请用户审阅。两者批准前不安装产品依赖、不搭建应用、不编写产品代码。
