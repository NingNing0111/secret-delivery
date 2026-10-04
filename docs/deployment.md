# 部署与本地启动

本地 Compose 已实际验证镜像构建、迁移、健康、登录/创建/提取以及数据库和应用重启后记录保留。查看 `implementation-ledger.md` 获取实际证据；完整最终验收另行记录。本项目不自动部署真实服务器。

## 配置

需要 Node.js 22、pnpm 10.33.0、Docker 和支持 `!override` 的 Compose 2.24.4+。使用项目根目录执行命令。

复制 `.env.example` 为 `.env.local`，权限设为 `chmod 600 .env.local`。分别运行以下命令生成不同的值，不重复使用密钥，不将输出写入公共日志：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

第一种用于独立的 `POSTGRES_PASSWORD`、`ADMIN_PASSWORD` 和 `SESSION_SECRET`；第二种仅用于 `SECRET_ENCRYPTION_KEY`。数据库密码建议使用 hex，避免连接 URL 转义问题。密钥及数据库必须备份，不能在升级时重新生成加密密钥。

- `PUBLIC_BASE_URL`：完整外部 origin，例如 `https://secrets.example.com`，不含子路径。
- `SITE_ADDRESS`：生产填写自己的域名，例如 `secrets.example.com`。
- `REQUEST_BODY_LIMIT`：默认 16777216 字节，应用与代理共用。单条仍最多 32768 UTF-8 字节、每批最多 5000 条。
- Compose 自动构建内部 `DATABASE_URL`；本机直接运行则自行填写指向专用数据库的 URL。

## 本地容器验证

`.env.local` 中设置 `PUBLIC_BASE_URL=http://127.0.0.1:8080`、`SITE_ADDRESS=:80`，以及上述独立随机凭据。

```sh
docker compose --env-file .env.local -f compose.yml -f compose.local.yml config --quiet
docker compose --env-file .env.local -f compose.yml -f compose.local.yml build
docker compose --env-file .env.local -f compose.yml -f compose.local.yml up -d
node scripts/verify-compose.mjs
```

验收脚本只允许此 loopback 地址，会创建合成数据并重启 app/db，不适用于生产。访问 `http://127.0.0.1:8080/admin/login`。本地 override 仅绑定 loopback，并显式设置 `ALLOW_INSECURE_LOCAL_COOKIE=true`；代码同时要求外部 URL 为 loopback HTTP 才关闭 Secure。

## 生产 HTTPS

不要加载 `compose.local.yml`。配置真实域名 DNS 和 80/443 入站，由使用者在自己的服务器执行：

```sh
docker compose --env-file .env.local config --quiet
docker compose --env-file .env.local build
docker compose --env-file .env.local up -d
docker compose --env-file .env.local ps -a
```

Caddy 自动签发证书，证书验证不在本项目本地交付范围内。生产必须使用 HTTPS；默认 Cookie 为 HttpOnly/Secure/SameSite=Lax。不要为了绕过登录问题关闭安全属性。数据库和应用不直接发布宿主端口；应用以非 root 用户运行。数据库健康后执行迁移，只有迁移退出 0 才启动应用。运行镜像包含 standalone 及 Prisma runtime，迁移镜像包含 CLI，启动时无需下载依赖。

`/api/health` 仅返回健康布尔值，检查环境及数据库连接，不返回内部错误。代理不启用访问日志，避免记录提取 Token；也不要在外层 CDN/代理启用包含完整 URL 的日志。

## 本机开发与测试

```sh
pnpm install --frozen-lockfile
pnpm exec prisma generate
# 为 db:migrate 提供 DATABASE_URL（Prisma 不自动读取 .env.local）
pnpm db:migrate
pnpm dev
```

Next 开发/构建会读取 `.env.local`。不要把部署库用作测试库。专用测试 PostgreSQL 的定义见 `compose.test.yml`，启动后设置 `TEST_DATABASE_URL` 为名称包含测试标识的数据库。依次运行 `pnpm lint`、`pnpm typecheck`、`pnpm test:unit`、`pnpm test:integration`、`pnpm build`、`pnpm test:e2e`。浏览器测试需要合成 ADMIN_PASSWORD、SESSION_SECRET、SECRET_ENCRYPTION_KEY 和指向专用测试库的 DATABASE_URL，以及 `PUBLIC_BASE_URL=http://127.0.0.1:3100`；不可使用生产数据。

### 可复现的隔离测试命令

以下仅使用合成凭据；集成测试会清空专用测试库，不要替换为部署数据库。首次安装 Chromium 需要网络。

```sh
docker compose -f compose.test.yml up -d --wait
export TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55432/secret_delivery_test
export DATABASE_URL="$TEST_DATABASE_URL"
export ADMIN_PASSWORD=synthetic-password-for-tests
export SESSION_SECRET=synthetic-session-secret-for-tests-only
export SECRET_ENCRYPTION_KEY=$(node -e 'console.log(Buffer.alloc(32,7).toString("base64"))')
export PUBLIC_BASE_URL=http://127.0.0.1:3100
export ALLOW_INSECURE_LOCAL_COOKIE=true
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright"
pnpm exec playwright install chromium
pnpm exec prisma migrate deploy
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:integration
pnpm build && pnpm test:e2e
```

不要并行运行共享此数据库的集成测试与浏览器测试。`pnpm start` 通过 `scripts/start.mjs` 复制静态资源并启动真正的 standalone server；端口使用 `PORT` 环境变量而非 `--port`，例如 `PORT=3100 pnpm start`。本机生产运行前用上述配置方法设置自己的环境变量；不要沿用测试凭据。

时间筛选控件明确使用 UTC；创建页面的自定义到期时间使用浏览器本地时间并转换为 ISO 时间提交。列表时间按浏览器时区展示。

单实例登录限流使用进程内全局 20 次/分钟预算；攻击者可暂时阻止登录，多副本部署没有共享限流。访问链接即消耗次数，刷新、扫描器正常 GET 也会消费；不承诺响应丢失时的可靠投递。网络结果不明时不要直接重复创建批次。

## Docker Hub 多架构镜像发布

项目内置支持 `linux/amd64`（Linux x86_64、Intel Mac）和 `linux/arm64`（Apple Silicon Mac、ARM 架构 Linux 服务器）的 Docker Hub 多平台发布脚本。

### 1. 发布前准备

确保本地 Docker 守护进程运行中，并登录 Docker Hub：

```sh
docker login
```

### 2. 执行发布

通过 npm script 或直接运行脚本发布：

```sh
# 发布当前 package.json 版本并附加 latest 标签
pnpm docker:publish -- -u <your-dockerhub-username>

# 或直接运行 bash 脚本，指定自定义版本标签
bash scripts/publish-docker.sh -u <your-dockerhub-username> -t v1.0.0

# 仅构建多架构镜像验证，不推送到 Docker Hub
bash scripts/publish-docker.sh -u <your-dockerhub-username> --no-push
```

脚本会自动使用 Docker Buildx 容器驱动构建跨平台 manifest，产物包含：
- 主应用镜像：`<your-dockerhub-username>/secret-delivery:<tag>`
- 数据库迁移镜像：`<your-dockerhub-username>/secret-delivery-migrate:<tag>`

