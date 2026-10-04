# Secret Delivery — 卡密批量提取系统设计文档

> 项目定位：小而完整、可直接生产部署的 MVP，避免过度设计。
>
> 当前状态：MVP 已完成本地验收，包括静态检查、生产构建、真实 PostgreSQL 测试、浏览器测试及 Docker Compose 重启持久化验证。下文原始需求保留，要求对应矩阵、执行证据与已知边界见 [验收记录](docs/verification.md) 和 [实施记录](docs/implementation-ledger.md)。未执行真实服务器部署、正式 TLS 签发或灾难恢复演练。
>
> 使用入口：[部署与本地启动](docs/deployment.md) · [升级、备份与恢复](docs/operations.md)。管理入口为 `/admin/login`；本地 Compose 地址为 `http://127.0.0.1:8080`。
>
> 后续工作目录：`secret-delivery/`。不要在其父目录创建应用代码或配置。
>
> 文档完整性说明：提供的原始设计在第 26 节「Token Security」要求后结束；本文件保留已提供的设计范围，未擅自补充后续安全需求。

## 1. 项目概述

### 1.1 项目名称

暂定名称：**Secret Delivery**。

这是一个用于虚拟商品发货的卡密提取链接生成系统。

核心用途：

> 将较长的卡密、账号信息、Token 等文本批量转换为独立的 HTTPS 提取链接，再将这些链接导入淘宝等电商平台的卡密库存。

例如原始内容：

```text
user@example.com----password----client_id----token----backup@example.com----backup_password
```

转换后：

```text
https://get.example.com/k/7Kp2mN8xQ4vL9sRtJ3HdFw
```

买家访问该链接后，可以查看并复制完整卡密内容。

## 2. 产品目标

系统需要重点解决以下问题：

1. 长卡密不适合直接通过电商平台发货。
2. 支持一次批量导入数百、数千条卡密。
3. 每条卡密生成唯一且不可枚举的提取链接。
4. 可以批量复制或导出提取链接。
5. 买家无需登录即可通过链接查看卡密。
6. 管理员可以管理已经生成的卡密。
7. 支持链接过期、禁用、查看次数等基础安全能力。
8. 支持 Docker Compose 一键部署。
9. 系统保持简单，不设计复杂的用户、支付、订单和商品系统。

该项目本质上是：

```text
Secret Storage
+
Batch Link Generator
+
Secret Viewer
```

而不是完整的电商发卡平台。

## 3. 技术栈

优先采用：

```text
Frontend / Backend:
Next.js 16+
TypeScript

UI:
Tailwind CSS
shadcn/ui

Database:
PostgreSQL 16+

ORM:
Prisma

Authentication:
管理员密码 + Session

Validation:
Zod

Deployment:
Docker
Docker Compose

Reverse Proxy:
Nginx / Caddy 均可

Package Manager:
pnpm
```

使用 Next.js Full Stack 模式，不需要额外创建 NestJS、Express、Spring Boot 等后端服务。

整体架构：

```text
                    Internet
                       │
                       ▼
                 Nginx / Caddy
                       │
                       ▼
                ┌──────────────┐
                │   Next.js    │
                │              │
                │ Admin UI     │
                │ Public UI    │
                │ API          │
                └──────┬───────┘
                       │
                       ▼
                ┌──────────────┐
                │ PostgreSQL   │
                └──────────────┘
```

## 4. 用户角色

MVP 只设计两个角色。

### 4.1 Administrator

管理员可以：

- 登录后台
- 批量创建卡密
- 查看卡密列表
- 搜索卡密
- 查看卡密详情
- 禁用链接
- 恢复链接
- 删除卡密
- 批量删除
- 导出提取链接
- 查看访问次数

不需要：

- 用户注册
- 多管理员
- RBAC
- OAuth
- 邮箱登录

### 4.2 Visitor

Visitor 即购买虚拟商品的客户。

无需登录。只需要访问：

```text
/k/{token}
```

即可查看对应卡密。

## 5. 核心业务流程

### 5.1 批量生成

管理员进入：

```text
/admin/secrets/create
```

页面提供大文本输入框。

提示：

```text
每行代表一条独立卡密
```

例如：

```text
account1----password1----token1
account2----password2----token2
account3----password3----token3
```

系统按照换行符拆分。

处理：

```text
Input
 ↓
Normalize Line Ending
 ↓
Split by Newline
 ↓
Trim
 ↓
Remove Empty Lines
 ↓
Validate
 ↓
Generate Secure Token
 ↓
Batch INSERT
 ↓
Return Links
```

生成：

```text
https://get.example.com/k/F0QJbJjNdRQZmRGNQQkt4w
https://get.example.com/k/5KsmqMqPxVPTQ0oB4AFzLg
https://get.example.com/k/PvQ27fNHMFhYZSP6gAPZUw
```

要求：**输入顺序必须和输出链接顺序严格一致。**

即：

```text
第 1 行 → 第 1 个链接
第 2 行 → 第 2 个链接
第 3 行 → 第 3 个链接
```

这一点非常重要，因为生成后的链接可能直接导入电商平台。

## 6. 批量创建页面

页面布局：

```text
┌─────────────────────────────────────────────────┐
│ 批量生成提取链接                                  │
├─────────────────────────────────────────────────┤
│                                                 │
│ 每行一条卡密                                     │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ account1----password----token               │ │
│ │ account2----password----token               │ │
│ │ account3----password----token               │ │
│ │                                             │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ 已识别：3 条                                    │
│                                                 │
│ 有效期                                          │
│ ○ 永久                                          │
│ ● 30 天                                         │
│ ○ 自定义                                        │
│                                                 │
│ 最大查看次数                                    │
│ [ 不限制                           ]             │
│                                                 │
│             [ 批量生成 3 个链接 ]                │
└─────────────────────────────────────────────────┘
```

点击生成后：

```text
生成成功

成功：1000
失败：0

[复制全部链接] [导出 TXT] [导出 CSV]
```

下面显示结果表格：

| # | 卡密预览 | 提取链接 | 操作 |
|---|---|---|---|
| 1 | account1----*** | https://.../k/xxx | 复制 |
| 2 | account2----*** | https://.../k/yyy | 复制 |

页面不能默认完整展示大量敏感卡密。只显示截断后的 Preview。

## 7. TXT 导出

TXT 格式必须非常简单：

```text
https://get.example.com/k/token1
https://get.example.com/k/token2
https://get.example.com/k/token3
```

一行一个链接，方便直接导入电商平台。

文件名：

```text
secret-links-2026-10-03-153000.txt
```

## 8. CSV 导出

格式：

```csv
index,url
1,https://get.example.com/k/token1
2,https://get.example.com/k/token2
3,https://get.example.com/k/token3
```

不要默认将原始 Secret 写入导出文件。

如果未来需要可以增加：

```text
Include original secret
```

选项。MVP 不实现。

## 9. 提取页面

访问：

```text
/k/{token}
```

显示：

```text
┌─────────────────────────────────────────┐
│              商品提取成功               │
│                                         │
│ 商品内容                                │
│ ┌─────────────────────────────────────┐ │
│ │ account@example.com----password... │ │
│ └─────────────────────────────────────┘ │
│                                         │
│          [ 一键复制全部内容 ]           │
│                                         │
│ 本链接将在 2026-11-03 过期              │
└─────────────────────────────────────────┘
```

页面要求：

- Mobile First
- 无需登录
- 页面尽量简单
- 不加载第三方统计脚本
- 不显示后台入口
- 支持一键复制
- 长 Token 自动换行
- 使用 monospace 字体展示内容
- 避免横向滚动

复制成功：

```text
已复制
```

## 10. 异常页面

### 10.1 不存在

```text
提取链接不存在

请确认链接是否完整。
```

### 10.2 已过期

```text
提取链接已过期

请联系商品卖家处理。
```

### 10.3 已禁用

```text
该提取链接已失效

请联系商品卖家处理。
```

### 10.4 超过查看次数

```text
该提取链接已达到最大查看次数

请联系商品卖家处理。
```

不要泄露具体数据库状态、ID 或异常堆栈。

## 11. Token 设计

禁止使用：

```text
/k/1
/k/2
/k/10086
```

也不要使用 UUID 自增式业务标识作为主要访问凭证。

使用 Node.js：

```typescript
crypto.randomBytes(24)
```

生成随机 Token，然后使用 Base64URL 编码。

例如：

```text
F0QJbJjNdRQZmRGNQQkt4wQW2MPpKZ4Q
```

URL：

```text
https://get.example.com/k/F0QJbJjNdRQZmRGNQQkt4wQW2MPpKZ4Q
```

要求：

```text
至少 128 bit entropy
推荐 192 bit
```

Token 必须：

- 不可预测
- 不可枚举
- UNIQUE
- URL Safe

数据库建立 UNIQUE INDEX。

## 12. 数据库设计

核心表：

```text
secrets
```

Prisma Schema 示例（概念模型；最终加密存储模型见第 13 节）：

```prisma
model Secret {
  id           String       @id @default(uuid())
  token        String       @unique
  content      String
  status       SecretStatus @default(ACTIVE)

  expiresAt    DateTime?
  maxViews     Int?
  viewCount    Int          @default(0)

  lastViewedAt DateTime?

  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  @@index([createdAt])
  @@index([status])
  @@index([expiresAt])
}

enum SecretStatus {
  ACTIVE
  DISABLED
}
```

## 13. Secret 内容加密

不建议数据库直接明文保存 Secret。

环境变量：

```text
SECRET_ENCRYPTION_KEY=
```

使用：

```text
AES-256-GCM
```

数据库实际保存：

```text
ciphertext
iv
authTag
```

而不是：

```text
content
```

建议最终 Schema：

```prisma
model Secret {
  id           String       @id @default(uuid())
  token        String       @unique

  ciphertext   String
  iv           String
  authTag      String

  status       SecretStatus @default(ACTIVE)

  expiresAt    DateTime?
  maxViews     Int?
  viewCount    Int          @default(0)
  lastViewedAt DateTime?

  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  @@index([createdAt])
  @@index([status])
  @@index([expiresAt])
}
```

Encryption Key 不允许存数据库。必须通过环境变量注入。

## 14. 查看次数设计

用户访问：

```text
GET /k/{token}
```

不能简单：

```text
SELECT
→
viewCount + 1
```

因为并发情况下可能绕过 maxViews。

必须使用数据库事务或者原子 UPDATE。

逻辑：

```text
BEGIN

SELECT secret

检查：

status == ACTIVE
expiresAt > now
maxViews == null OR viewCount < maxViews

满足条件：

UPDATE
viewCount = viewCount + 1
lastViewedAt = now

COMMIT
```

需要防止并发请求导致：

```text
maxViews = 1

Request A → success
Request B → success
```

正确行为必须只能有一个请求成功。

## 15. 管理后台

路由：

```text
/admin
/admin/login
/admin/secrets
/admin/secrets/create
/admin/secrets/{id}
```

Dashboard MVP 只需要展示：

```text
Secret 总数
Active 数量
Expired 数量
Disabled 数量
总访问次数
```

不要设计复杂 BI。

## 16. Secret 列表

表格：

```text
┌─────────────────────────────────────────────────────┐
│ Secret Management                                   │
├─────────────────────────────────────────────────────┤
│ Search [________________________]                    │
│                                                     │
│ □  Preview      Views      Expires      Status      │
│ □  abc***       0          30 days      Active      │
│ □  xyz***       2          Never        Active      │
│ □  foo***       1          Expired      Expired     │
│                                                     │
│ [Disable] [Delete]                                  │
└─────────────────────────────────────────────────────┘
```

支持：

- Pagination
- Search
- Status Filter
- Created Time
- Expiration Filter

默认：

```text
50 / page
```

## 17. Search

由于 Secret 是加密存储的，不要为了搜索直接对完整 ciphertext 做模糊搜索。

可以额外保存一个非敏感 Preview，例如：

```text
account***@gmail.com
```

或者：

```text
user@example.com...
```

MVP 搜索：

```text
token
id
```

即可。

不要为了搜索功能破坏 Secret 加密设计。

## 18. Secret 详情

后台可以查看：

```text
ID
Token
URL
Status
Created At
Expires At
View Count
Max Views
Last Viewed At
```

Secret Content 默认：

```text
••••••••••••••••••••
```

管理员点击：

```text
Reveal
```

才向服务器请求解密后的内容。

不要把解密内容预先放入 HTML 或 React Server Component Payload 后再通过 CSS 隐藏。

## 19. 删除策略

支持：

```text
Disable
Delete
```

Disable：

```text
status = DISABLED
```

Delete：

```text
真正删除数据库记录
```

批量删除必须二次确认：

```text
确认删除选中的 100 条 Secret？

删除后无法恢复。
```

## 20. 管理员认证

MVP 不需要用户系统。

环境变量：

```text
ADMIN_PASSWORD=
SESSION_SECRET=
```

访问：

```text
/admin/*
```

必须经过 Session Authentication。

登录：

```text
/admin/login
```

只需要：

```text
Password
```

密码验证必须使用 timing-safe comparison 或可靠认证库提供的安全验证方式。

Session Cookie：

```text
HttpOnly
Secure
SameSite=Lax
```

生产环境必须 HTTPS。

## 21. API

建议：

```text
POST   /api/admin/login

POST   /api/admin/secrets/batch
GET    /api/admin/secrets
GET    /api/admin/secrets/{id}
DELETE /api/admin/secrets/{id}

POST   /api/admin/secrets/{id}/disable
POST   /api/admin/secrets/{id}/enable

POST   /api/admin/secrets/batch/delete
POST   /api/admin/secrets/batch/disable

GET    /api/admin/secrets/{id}/reveal

GET    /api/secret/{token}
```

如果使用 Server Actions 能明显减少代码，可以使用 Server Actions。

但业务逻辑必须放在：

```text
services/
```

不要将核心逻辑直接写进 React Component。

## 22. Batch API

请求：

```json
{
  "secrets": [
    "secret A",
    "secret B",
    "secret C"
  ],
  "expiresAt": "2026-11-03T00:00:00Z",
  "maxViews": null
}
```

响应：

```json
{
  "total": 3,
  "success": 3,
  "failed": 0,
  "items": [
    {
      "index": 0,
      "url": "https://get.example.com/k/xxx"
    },
    {
      "index": 1,
      "url": "https://get.example.com/k/yyy"
    },
    {
      "index": 2,
      "url": "https://get.example.com/k/zzz"
    }
  ]
}
```

必须保留原始 index。

## 23. 批量性能

MVP 要求：

```text
1000 条 → 正常处理
5000 条 → 可以处理
```

不要：

```text
for secret:
    await prisma.secret.create()
```

产生数千次串行数据库请求。

应该：

```text
Generate tokens
↓
Encrypt
↓
createMany / transaction
```

但注意 Prisma 和 PostgreSQL 单次 SQL 参数数量限制。

对于大量数据应该 Chunk：

```text
CHUNK_SIZE = 500
```

例如：

```text
5000 secrets
↓
10 × 500
```

## 24. 输入限制

必须限制：

```text
单条 Secret 最大：32 KB
单次最多：5000 条
```

空行：

```text
自动忽略
```

前后空格原则上：

```text
trim()
```

但不要修改 Secret 内部字符。

例如：

```text
abc ---- password ---- token
```

不能擅自变成：

```text
abc----password----token
```

## 25. 重复 Secret

默认：**允许相同 Secret 多次生成。**

例如：

```text
AAA
AAA
AAA
```

应该生成：

```text
/k/token1
/k/token2
/k/token3
```

因为它们可能代表三个不同订单。

不要根据 Secret 内容去重。

## 26. 安全

这是整个系统的重要部分。

必须实现：

### Token Security

使用 cryptographically secure random。
