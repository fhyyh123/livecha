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

## 4.1 GeoIP（离线 MaxMind）与真实访客 IP 头部

为了在坐席端右栏（Customer/客户分组）显示“地址/本地时间/地图”，后端会：

- 从请求中解析“真实 client IP”（**仅用于离线定位，不会下发到前端，也不需要在 UI 展示**）
- 使用离线 MaxMind GeoLite2 City 数据库（`.mmdb`）做 Geo 查询
- 将结果写入 `visitor.geo_*` 字段，并在坐席端会话详情接口中下发（city/region/country/lat/lon/timezone 等）

### A) 放置 GeoLite2 City mmdb

1) 到 MaxMind 获取 **GeoLite2 City** 的 mmdb 文件（例如 `GeoLite2-City.mmdb`）。
   - GeoLite2 需要遵循 MaxMind 的许可条款；建议在你的组织内网制品库/对象存储中分发该文件。

2) 生产机放置到一个固定路径（示例）：

```bash
mkdir -p /opt/chatlive/geoip
# 将 GeoLite2-City.mmdb 放到 /opt/chatlive/geoip/GeoLite2-City.mmdb
```

3) 通过环境变量告诉后端文件路径：

- `APP_GEOIP_DB_PATH=/path/to/GeoLite2-City.mmdb`
- （可选）`APP_GEOIP_REFRESH_TTL_SECONDS=21600`（默认 6 小时；用于控制多久刷新一次 visitor 的 geo 缓存）

如果你用 Docker Compose 运行后端，推荐用 volume 挂载只读：

```yaml
services:
  app:
    environment:
      APP_GEOIP_DB_PATH: /data/GeoLite2-City.mmdb
      APP_GEOIP_REFRESH_TTL_SECONDS: 21600
    volumes:
      - /opt/chatlive/geoip/GeoLite2-City.mmdb:/data/GeoLite2-City.mmdb:ro
```

未配置 `APP_GEOIP_DB_PATH` 时，GeoIP 功能会自动禁用（不影响聊天主流程）。

### B) 反向代理需要透传真实 client IP

后端定位依赖以下头部之一（按优先级尝试）：

- `X-Forwarded-For`（推荐，Nginx 最常见）
- `X-Real-IP`
- `Forwarded`（RFC 7239）

仓库示例 Nginx 已包含：

- `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`

建议补充（可选）：

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
```

### C) 安全注意事项（重要）

转发头（如 `X-Forwarded-For`）可能被客户端伪造。

生产环境务必确保：

- 后端服务不直接暴露公网，只允许来自你信任的反向代理/网关访问
- 或在网关层移除客户端传入的 `X-Forwarded-*` / `Forwarded` 头，并由网关重新设置

---

## 4.2（可选）Google 地图 Key

坐席端地图渲染使用 Google Maps Embed（iframe）。前端需要：

- `VITE_GOOGLE_MAPS_API_KEY=...`

注意：Key 需要启用相应 API（通常是 **Maps Embed API**），并配置域名/来源限制。

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
