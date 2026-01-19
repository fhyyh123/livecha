# 部署与发布（GitHub Release）

本文档说明如何把 ChatLive 从本仓库构建并部署到服务器，并给出推荐的 GitHub Release 流程。

> 约定：后端服务端口默认 `8080`；本地开发网关端口默认 `8088`。

---

## 1. 组件与依赖

- 后端：Spring Boot（Java 21），依赖 Postgres、（可选）Redis、（可选）S3/MinIO
- 前端：Vite + React（产物为静态文件，可用 Nginx/任意静态托管）
- Widget：后端托管 `GET /chatlive/widget.js` 与版本化 `GET /chatlive/widget/{version}/widget.js`
- 本仓库提供两条部署路径：
  - **在线部署（推荐）**：服务器直接 `docker compose` 拉起
  - **离线/半离线部署**：使用 `prod-bundle-A/` 先导出镜像 tar，再在生产机 `docker load`

---

## 2. 在线部署（服务器直接 Docker Compose）

### 2.1 前置

- Docker + `docker compose`
- 一个域名（建议）
  - 例如 `https://app.example.com`（前端/访客页）
  - 例如 `https://api.example.com`（后端 API/WS/Widget）
- 生产环境请务必：
  - 替换默认口令（数据库、MinIO、JWT）
  - 在接入层启用 HTTPS

### 2.2 使用仓库自带 compose（开发形态）

仓库中的 `infra/docker-compose.yml` 更适合本地开发/演示（端口对外较多，默认口令偏弱）。

生产建议使用 `prod-bundle-A/docker-compose.prod.yml` 的思路：

- 数据只绑定到 `127.0.0.1`
- 使用 `.env` 管理敏感配置

你可以：

1) 复制 `prod-bundle-A/docker-compose.prod.yml` 到你自己的生产目录
2) 复制并编辑环境变量文件

```bash
cp prod-bundle-A/.env.prod.example prod.env
# 编辑 prod.env
```

关键环境变量（必须改）：

- `POSTGRES_PASSWORD`
- `MINIO_ROOT_PASSWORD`
- `JWT_SECRET`（至少 32 bytes）

与域名相关（强烈建议配置）：

- `WIDGET_PUBLIC_SCRIPT_BASE_URL`：生成 snippet 的脚本基地址（通常是你的后端公网域名）
- `WIDGET_PUBLIC_EMBED_URL`：访客 iframe 地址（通常是你的前端公网域名 `/visitor/embed`）
- `APP_ONBOARDING_FRONTEND_BASE_URL`：邮件中的回跳地址（前端域名）

然后启动：

```bash
docker compose --env-file prod.env -f prod-bundle-A/docker-compose.prod.yml up -d
```

---

## 3. 离线/半离线部署（prod-bundle-A）

该模式适合：

- 生产机不能访问公网
- 希望在打包机（CI/开发机）完成构建

### 3.1 打包机：导出后端镜像 tar

```bash
./prod-bundle-A/build-bundle.sh
# 或指定 tag
./prod-bundle-A/build-bundle.sh prod-YYYYMMDD
```

产物为：`prod-bundle-A/chatlive-backend_<tag>.tar`

### 3.2 生产机：离线启动

把整个 `prod-bundle-A/` 目录拷到生产机，然后：

```bash
cd prod-bundle-A
cp .env.prod.example .env
# 编辑 .env：至少改 POSTGRES_PASSWORD / MINIO_ROOT_PASSWORD / JWT_SECRET

./deploy-offline.sh
```

脚本内部会执行：

- `docker load -i chatlive-backend_<tag>.tar`
- `docker compose --env-file .env -f docker-compose.prod.yml up -d`

---

## 4. Nginx / 反向代理建议

仓库 `infra/nginx/nginx.conf` 提供了一个最小示例：

- `/api/` → 后端 `http://app:8080/api/`
- `/ws` → 后端 `http://app:8080/ws`（WebSocket Upgrade）
- `/chatlive/` → 后端 `http://app:8080/chatlive/`（widget.js 等静态资产）

生产环境推荐：

- 对外只暴露 Nginx（或你的网关）
- 后端、数据库、MinIO 仅内网访问
- 统一在网关层做 TLS

---

## 5. GitHub Release 推荐流程

### 5.1 版本号与 tag

建议使用语义化版本（例如 `v0.1.0`）。每次发布：

1) 确认主分支构建通过（后端 `mvn test`，前端 `npm run build`）
2) 创建 tag 并推送

```bash
git tag v0.1.0
git push origin v0.1.0
```

### 5.2 Release 产物建议

根据你的分发方式选择：

- 离线用户：把 `prod-bundle-A/chatlive-backend_<tag>.tar` 作为 Release asset
- 在线用户：不需要 tar，只需要发布部署文档与变更说明

如果你希望把前端静态文件也作为 Release asset：

```bash
cd frontend-agent
npm ci
npm run build
# 产物在 frontend-agent/dist
```

---

## 6. 上线检查清单

- [ ] `JWT_SECRET` 已替换（并妥善保管）
- [ ] Postgres / MinIO 默认口令已替换
- [ ] 已启用 HTTPS
- [ ] `WIDGET_PUBLIC_SCRIPT_BASE_URL` / `WIDGET_PUBLIC_EMBED_URL` 已配置为公网域名
- [ ] 备份策略：数据库卷、MinIO 数据卷
- [ ] 监控与日志：至少开启健康检查与关键错误告警
