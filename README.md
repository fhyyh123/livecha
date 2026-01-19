
# ChatLive

一个自托管的“网站在线客服/访客聊天”系统：

- **后端**：Spring Boot 3（Java 21），REST API + WebSocket，Postgres + Flyway
- **前端（坐席/管理台）**：React + Vite + antd（Refine）
- **访客 Widget**：后端托管 `widget.js`，在站点中一行脚本即可挂载；iframe 指向前端的访客页
- **基础设施**：Docker Compose（Postgres / Redis / MinIO / Nginx）

> 说明：本仓库同时包含开发演示页与“离线/半离线”生产部署打包方案。

---

## 功能概览

- 账号体系：注册 / 登录 / 邮箱验证码（可关）/ 接受邀请
- 多站点（Site）管理：为每个站点生成独立 `site_key`，可配置 allowlist 域名等
- 访客侧：创建/恢复会话、发送消息、发送文件（可选 S3/MinIO）
- 坐席侧：会话列表、消息、分配策略（默认 round-robin）
- 实时能力：WebSocket 推送（`/ws`、`/ws/public`）
- 自动归档：会话长时间无消息可自动归档（可配置）
- Widget 资产：
	- 稳定 URL：`/chatlive/widget.js`（短缓存，方便热修复）
	- 版本化 URL：`/chatlive/widget/{version}/widget.js`（长缓存，适合 CDN）

---

## 目录结构

- `backend/`：Spring Boot 后端（API、WS、Flyway migrations、打包成 jar）
- `frontend-agent/`：坐席/管理台前端（Vite）
- `infra/`：本地/开发 Docker Compose（含 Nginx 网关）
- `docs/`：Widget 与演示页（`demo.html`、`demo_snippet.html`、`widget.js` 源）
- `scripts/`：开发演示一键脚本
- `prod-bundle-A/`：离线/半离线生产部署打包与脚本

---

## 快速开始（推荐：Docker 一键起后端 + 基础设施）

### 依赖

- Docker + `docker compose`
- Java 21 + Maven（仅脚本会用来打 jar；你也可以只用 Docker 构建后端镜像）
- Node.js 18+（建议 20/22）+ npm

### 启动后端/中间件

```bash
./scripts/demo-up.sh
```

脚本会做三件事：

1) `backend/` 打包 jar（跳过测试）
2) `infra/` 启动 Postgres/Redis/MinIO/后端/Nginx
3) 确保 `frontend-agent/` 安装依赖（仅安装，不启动）

启动完成后常用地址：

- Nginx 网关：`http://localhost:8088`
- 后端（直连）：`http://localhost:8080`
- Widget 脚本（经网关）：`http://localhost:8088/chatlive/widget.js`

### 启动前端（坐席/访客页）与演示站点页

```bash
./scripts/demo-dev.sh
```

- 前端 Vite：`http://localhost:5173`
- 演示站点页：
	- `http://localhost:4173/demo.html`
	- `http://localhost:4173/demo_snippet.html`

### 停止

```bash
./scripts/demo-down.sh
```

---

## 前端代理与 API/WS 代理

开发态（Vite）会把：

- `/api` 代理到后端（默认 `VITE_BACKEND_HTTP`，不配则走配置里的默认值）
- `/ws` 以 WebSocket 方式代理到后端（默认 `VITE_BACKEND_WS`）

如需自定义后端地址：

```bash
cd frontend-agent
VITE_BACKEND_HTTP=http://localhost:8088 \
VITE_BACKEND_WS=ws://localhost:8088 \
npm run dev
```

---

## Widget 接入

### 1) 直接使用稳定脚本 URL

把下面代码插入你的网站 HTML：

```html
<script src="http://localhost:8088/chatlive/widget.js"></script>
<script>
	ChatLiveWidget.init({
		siteKey: 'pk_demo_change_me',
		embedUrl: 'http://localhost:5173/visitor/embed'
	})
</script>
```

### 2) 使用“管理端生成的 snippet”（推荐）

后端提供接口生成 snippet（会包含**版本化**脚本地址与站点参数）：

- `GET /api/v1/admin/sites/{id}/widget/snippet`

你也可以直接参考演示页：`docs/demo.html`、`docs/demo_snippet.html`。

---

## 配置（环境变量）

后端核心配置在 `backend/src/main/resources/application.yml`，支持环境变量覆盖。常用项：

- `SPRING_PROFILES_ACTIVE`：默认 `prod`
- 数据库：`SPRING_DATASOURCE_URL` / `SPRING_DATASOURCE_USERNAME` / `SPRING_DATASOURCE_PASSWORD`
- JWT：`JWT_SECRET`（生产务必替换，至少 32 bytes）
- 邮件（可选）：`APP_EMAIL_ENABLED`、`SPRING_MAIL_*`、`APP_EMAIL_FROM`
- Widget：
	- `WIDGET_PUBLIC_SCRIPT_BASE_URL`：生成 snippet 时使用的外部脚本基地址（指向你的域名/CDN）
	- `WIDGET_PUBLIC_EMBED_URL`：iframe 访客页地址（通常是前端域名的 `/visitor/embed`）
- S3/MinIO（可选）：`S3_ENABLED=true` 以及 `S3_*`（见 `infra/docker-compose.yml`）

---

## 生产部署（离线/半离线：prod-bundle-A）

`prod-bundle-A/` 用于把后端镜像导出为 tar，在生产机 `docker load` 后离线启动。

### 打包机（本地/CI）构建并导出镜像

```bash
./prod-bundle-A/build-bundle.sh
# 或指定 tag
./prod-bundle-A/build-bundle.sh prod-20260119
```

### 生产机部署

```bash
cd prod-bundle-A
cp .env.prod.example .env
# 编辑 .env：至少改 POSTGRES_PASSWORD / MINIO_ROOT_PASSWORD / JWT_SECRET 等

./deploy-offline.sh
```

---

## 安全与上线建议

- 生产环境请替换默认口令与 `JWT_SECRET`
- 建议在公网接入层启用 HTTPS（可在 Nginx/网关上做 TLS）
- Widget/访客来源建议使用 allowlist（站点域名白名单），避免被第三方站点滥用

---

## 开发说明

- 后端：`backend/`（Spring Boot 3.3.x，Java 21，Flyway migrations）
- 前端：`frontend-agent/`（Vite + React 18 + antd + Refine）
- 本地栈：`infra/`（含 Nginx 将 `/api/`、`/ws`、`/chatlive/` 转发到后端）

