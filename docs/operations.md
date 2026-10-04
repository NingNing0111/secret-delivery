# 运维与恢复

以下示例为生产 Compose；本地操作须追加 `-f compose.yml -f compose.local.yml`。所有命令在项目根目录运行。不要执行 `down -v`、volume prune 或容器平台重置；它们可能删除数据。

## 升级

1. 先备份数据库并验证备份可读，另存加密密钥及配置。
2. 在测试环境验证新版本，保留旧镜像版本和锁文件。基础镜像使用版本标签，正式发布可固定已验证 digest。
3. `docker compose --env-file .env.local build`。
4. 安排维护窗口：`docker compose --env-file .env.local stop app caddy`。
5. `docker compose --env-file .env.local run --rm migrate`，确认退出 0；失败时不启动应用。
6. `docker compose --env-file .env.local up -d`，检查 `ps -a`、健康接口及管理员登录。不要用真实提取链接做无副作用探测，GET 会消费次数。

数据库迁移不承诺自动回滚；有不兼容迁移时仅回滚应用镜像不够，应先在隔离环境演练从备份恢复。迁移失败不要手动把迁移标记为成功来绕过检查。

## 备份

先确保备份目录受保护。示例文件名仅用于说明，正式备份应有时间戳、保留策略、校验和以及异地加密副本。

```sh
mkdir -p backups
chmod 700 backups
(umask 077; docker compose --env-file .env.local exec -T db \
  pg_dump -U secret_delivery -d secret_delivery -Fc > backups/database.dump)
# 检查命令退出状态及目录清单可读；这不替代恢复演练
cat backups/database.dump | docker compose --env-file .env.local exec -T db pg_restore --list > /dev/null
```

不要提交 `backups/`。数据库只含密文但仍含有效 Token 和元数据，应按敏感数据处理。`SECRET_ENCRYPTION_KEY` 必须在与数据库不同的安全位置备份；丢失无法解密。恢复时保持原加密密钥。SESSION_SECRET 可轮换使已有会话失效；加密密钥不能直接换值，MVP 没有数据重加密工具。

## 恢复演练

在隔离项目及空数据库恢复，不能直接覆盖运行中的生产库。为演练使用独立 Compose project（`-p secret-delivery-restore`）、不同入口端口/域名和单独配置，检查最终 `config --quiet`，避免与现有项目同名卷和端口冲突。先只启动 db，待健康后：

```sh
# 以下命令仅在确认目标为空的隔离恢复项目执行
# 将 ENV_FILE 替换成恢复项目配置文件路径
# 不使用 --clean 或删除生产数据库

docker compose -p secret-delivery-restore --env-file ENV_FILE up -d db
docker compose -p secret-delivery-restore --env-file ENV_FILE exec -T db \
  pg_restore -U secret_delivery -d secret_delivery --no-owner --exit-on-error < backups/database.dump
```

导入完成后配置原加密密钥、启动迁移及应用，验证合成样本解密、统计及登录。新服务器使用相同加密密钥也必须确保磁盘/备份访问控制。本文描述恢复步骤；本次交付的数据库重启持久化验证不等同于灾难恢复演练。

## 故障诊断与限制

- `docker compose --env-file .env.local ps -a` 查看健康及迁移退出状态。
- 仅在受控终端查看服务日志，不分享环境变量、密码、Cookie、密钥或完整提取 URL。
- Docker daemon 不可用时先恢复容器平台，不要删除卷。遇到构建缓存 snapshot 丢失，可用 `build --no-cache` 重建；这不会删除数据库卷。
- app 健康检查验证配置及数据库连接；Caddy 健康检查验证管理端监听，不代表外部 DNS/TLS 正常。
- 不要在生产启用访问日志、Prisma query logging、第三方分析或请求体日志。日志轮转限制单文件大小，不替代磁盘监控。
- 定期在隔离环境执行恢复演练；监控磁盘、数据库连接及证书到期。自动备份调度、密钥轮换和多副本协调不在 MVP 范围内。
