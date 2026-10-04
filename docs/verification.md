# MVP 验收记录

验收日期：2026-10-03。范围为 README 第 1–26 节已有内容，不含真实服务器、域名或真实证书签发。本次由当前会话直接实施并自查，没有独立人工/子代理代码审查；不宣称完成渗透测试或灾难恢复演练。

## 环境与实际命令

macOS 本机，Node 22.22.1、pnpm 10.33.0、Docker 29.4.0、Compose 5.1.2、PostgreSQL 16 容器；Next 16.3.8、Prisma 6.19.3、Playwright Chromium。测试数据库独立绑定 `127.0.0.1:55432`，不使用部署数据库。合成凭据和完整可复现命令见 [deployment.md](deployment.md)。

以下命令顺序执行、退出码均为 0，日志 `.final-verification.log`：

| 命令 | 结果 |
| --- | --- |
| `pnpm exec prisma migrate deploy` | 1 个迁移，数据库已应用，无待执行迁移 |
| `pnpm lint` | 0 错误、0 警告 |
| `pnpm typecheck` | 通过 |
| `pnpm test:unit` | 8 文件、48 项通过 |
| `pnpm test:integration` | 6 文件、31 项通过，真实 PostgreSQL |
| `pnpm build` | Next 生产构建通过 |
| `pnpm test:e2e` | 7 项通过，实际 standalone server，单 worker 顺序运行 |

最终 Compose 重新构建、启动、验收全部退出 0：

```sh
docker compose --env-file .env.local -f compose.yml -f compose.local.yml build
docker compose --env-file .env.local -f compose.yml -f compose.local.yml up -d
node scripts/verify-compose.mjs
```

日志为 `.compose-final-build.log`、`.compose-final-up.log`、`.compose-final-verify.log`。验收实际检查 app/db/caddy 健康、迁移退出 0、认证和 Origin、脱敏创建、访客提取、数据库及应用重启后的数据保留，以及服务日志不含测试 Token/Secret。没有删除卷。合成 `.env.local` 权限 0600，未写入模板、构建上下文或文档。

## README 要求对应表

| README 节 | 实现 | 验证与结果 |
| --- | --- | --- |
| 1–4 项目范围、技术栈、角色 | Next 全栈、中文 admin/visitor、`services/`；Prisma、Zod、Tailwind、shadcn 风格 Button | 构建及浏览器登录/无登录提取通过；无额外后台服务、支付/订单/多管理员功能 |
| 5–6 批量生成与结果 | `lib/batch-input.ts`、`services/batches.ts`、`components/admin/batch-form.tsx` | 单元/集成验证换行、trim、空行、重复、顺序；浏览器验证识别计数、结果预览、逐条及全部复制、禁止重复提交、不确定结果提示 |
| 7–8 TXT/CSV | `lib/exports.ts`、管理导出路由及客户端下载 | 单元检查一行一链、CSV index/url 和顺序；集成验证选中记录按批次/批内顺序导出；浏览器实际下载 CSV 并逐行匹配，确认无原始 Secret |
| 9–10 访客页面与异常 | `/k/[token]`、`secret-viewer.tsx` | 4 项浏览器测试覆盖访客提取、复制、拒绝剪贴板手动复制提示、375px 长文本不溢出和不存在/过期/禁用/次数耗尽；无后台入口或统计脚本 |
| 11–13 Token/数据模型/加密 | `lib/token.ts`、`lib/crypto.ts`、Prisma schema/migration | `randomBytes(24)` Base64URL、UNIQUE；AES-256-GCM 的 ciphertext/iv/authTag；单元篡改检测、真实库逐行解密验证；无 plaintext 字段、密钥只由环境提供 |
| 14 次数与并发 | `services/retrieval.ts` 条件 UPDATE RETURNING + 事务内解密 | 真实 DB 20 个并发请求争抢 maxViews=1，仅 1 成功且 count=1；解密失败回滚；浏览器首次=1、刷新=2、复制不增加；HEAD/显式预取不消费 |
| 15–17 仪表盘、分页、筛选、搜索 | `services/dashboard.ts`、`services/secrets.ts`、admin 页面 | 集成验证互斥状态统计、访问总数、稳定分页、token/id 精确搜索、状态与创建/到期范围组合；浏览器 51 条跨页选择及批量禁用。日期控件标注 UTC，Asia/Shanghai 服务时区回归通过 |
| 18 详情及显式 Reveal | `getSecret` 仅返回元数据与预览，Reveal 独立 POST | 集成无 ciphertext/iv/authTag/plaintext；浏览器主动 Reveal 前检查初始 HTML、DOM、实际 RSC 网络正文（等待读取完成且非空）；Reveal 返回内容但不消费次数 |
| 19 删除/禁用/恢复 | 单条及批量管理路由、`delete-dialog.tsx` | 集成实际删除、禁用/恢复、不重置到期与次数；浏览器禁用/恢复、批量删除取消和确认、跨页选择隔离 |
| 20 管理认证 | `services/auth.ts`、页面/路由 guard、cookie/origin helpers | SHA256 固定长度摘要 + timingSafeEqual；数据库存 HMAC Session 摘要、12h 过期；每个管理路由缺失/伪造/过期 Session 测试；浏览器登录/退出及重新访问拦截 |
| 21–22 API/业务分层/批次协议 | Node route handlers 调用 `services/` | 集成检查 HTTP 状态、输入错误、认证、Origin、index/脱敏结果；Reveal/导出使用 POST（相对建议 GET 的安全取舍），需同源 |
| 23 批量性能 | 每块 500 条 createMany，同一事务 | 1000/5000 实测，顺序和重复逐行验证；第二块故障首块回滚、Token 碰撞有界重试见下方 |
| 24–25 输入限制/重复 | Zod + 流式请求体字节限制 | 32 KB UTF-8 单条、5000 条上限、空行/内部字符/CRLF/重复的单元及真实 DB 路由测试通过；伪造或缺失 Content-Length 仍限流式字节 |
| 26 已提供 Token 安全 | Node crypto 安全随机，数据库唯一约束 | Token 单元测试与真实库唯一/碰撞重试测试通过；未补造第 26 节未提供的产品需求 |
| 部署、日志、安全运维 | Dockerfile、Compose、Caddy、health、`proxy.ts`、运维文档 | 实际部署/重启验收通过；no-store/no-referrer、通用错误无堆栈；生产 Secure/HttpOnly/SameSite=Lax；loopback HTTP 唯一显式例外；备份目录排除构建上下文 |

## 批量性能与故障证据

`TEST_DATABASE_URL=… pnpm exec vitest run --project integration tests/integration/batches.test.ts --reporter=verbose --silent=false`，日志 `.final-performance.log`：

- 1000 条：服务创建 113 ms。
- 5000 条：服务创建 288 ms。
- 数据为短合成文本（含 Unicode、重复），本机 Node → Docker PostgreSQL 16；耗时覆盖加密、Token、事务写入及结果生成，不代表最大 32 KB 行或远程 HTTP 吞吐 SLA。
- 两种规模均重新查询数据库，逐条解密并验证输入顺序、重复保留、唯一 Token、返回 index 和链接一致。
- 501 条在第二块触发真实数据库 CHECK 约束错误，验证 0 持久化；Token 碰撞测试只替换随机源，数据库仍真实。

## 自查与验收中修复

1. 本机 `next start` 与 standalone 配置不匹配：改为 `scripts/start.mjs`，复制静态资源并直接启动构建产物；浏览器测试实际使用该入口。
2. Reveal 前网络检查原异步监听器没有等待，可能空集合通过：改为通过 Playwright route.fetch 获取真实目标详情响应，在交付浏览器前读取完整正文，再原样 fulfill；要求非空并含目标 ID/preview，同时检查直接初始 HTML。CDP response.text 在导航中会丢失响应资源，故不再依赖该监听方式；未模拟或替换服务端内容，也不吞掉读取失败。该回归连续三次通过（`.capture-regression.log`），随后完整检查通过。
3. `datetime-local` 的无时区字符串曾受服务器时区影响：真实 DB 回归先失败（预期 4、实际 0），后统一 UTC 并明确标签，通过。
4. 逐条核对 README 第 6 节补齐识别条数、逐条复制；浏览器先验证缺失失败，再实现并回归通过。
5. 三处认证边界全页跳转有意清除旧客户端/RSC 状态，仅局部附理由抑制 Next lint 警告。
6. 核对事务回滚、限定 Token 碰撞重试、请求流取消、Session 清理、下载 Blob URL 释放；`src/` 无 TODO/FIXME、console 日志或 HTML 注入接口。管理 handler 回调抛错由公共 `adminResponse` 捕获，非漏捕异常。

## 已知边界和工具诊断

- LSP 缓存仍显示 8 条历史路由模块缺失；文件存在、实际集成 import 与 CLI tsc/生产构建通过。主动 LSP 探测为 inconclusive，不能宣称 LSP 全绿。通用 YAML 检查不识别 Compose 的 `!override`，实际 Compose config/build/up 已验证；验收 CLI 故意让 JSON/断言异常向上传播以失败退出。
- 单实例进程内全局 20 次/分钟登录预算可能被耗尽，不能代替多实例共享限流。生产 HTTPS、主机权限、磁盘/备份保护仍由部署者负责。
- 提取链接本身是凭证；普通 GET（含扫描器）消费次数。断网响应丢失不保证可重复领取。恢复链接不重置次数/到期。
- 默认总请求体 16 MiB 与每条 32 KB/每批 5000 条同时生效，不承诺 5000 条都为最大长度可在默认体积内提交。
- 性能只代表本机合成规模。未进行全浏览器兼容、外部渗透、正式 TLS、灾难恢复实操或生产负载测试。
- 恢复步骤及密钥备份注意事项见 [operations.md](operations.md)。数据库重启保留不是灾备演练；丢失加密密钥无法解密，直接替换密钥也不会迁移旧数据。
