# ChatLive 功能现状文档

> 
> 范围：本仓库（backend + frontend-agent + widget 资产托管 + infra/docs）。

---

## 1. 架构概览

- 后端：Spring Boot 3（Java 21），提供 REST API + WebSocket（自定义 JSON 协议）。
- 存储：Postgres（Flyway migrations），可选 Redis、可选 S3/MinIO（附件 presign）。
- 前端（坐席/管理台）：`frontend-agent/`（Vite + React + antd + Refine）。
- 访客 Widget：后端托管 `GET /chatlive/widget.js`（稳定 URL）与 `GET /chatlive/widget/{version}/widget.js`（版本化 URL）。
- 访客侧 UI：采用 iframe，指向前端路由 `/visitor/embed`。
- 网关：`infra/nginx/nginx.conf` 提供示例（`/api`、`/ws`、`/chatlive` 转发到后端）。

入口文档：
- 项目 README：`README.md`
- 部署文档：`docs/DEPLOYMENT.md`

---

## 2. 鉴权与错误返回

### 2.1 鉴权模型（JWT）

- 大部分受保护接口要求：`Authorization: Bearer <token>`。
- 访客侧 public 接口使用 `visitor_token`（由 widget bootstrap 签发）。
- 代码风格：多数 Controller 内部手动提取 token 并 `jwtService.parse(token)`。

### 2.2 统一错误格式

- 全局异常映射在：`backend/src/main/java/com/chatlive/support/common/api/GlobalExceptionHandler.java`
- 典型错误码：
  - `missing_token` → 401
  - `invalid_token` / `token_expired` → 401
  - `forbidden` → 403
  - 其他 `IllegalArgumentException(message)` → 400

---

## 3. 后端 API 清单（按业务域）

> 说明：以下路径以代码中的 `@RequestMapping` / `@*Mapping` 为准。

### 3.1 Auth（注册/登录/验证/邀请）

文件：`backend/src/main/java/com/chatlive/support/auth/api/AuthController.java`

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/verify-email-code`
- `POST /api/v1/auth/resend-verification`
- `POST /api/v1/auth/accept-invite`
- `GET  /api/v1/auth/me`

### 3.2 Admin - Welcome 引导流（SaaS onboarding 风格）

文件：`backend/src/main/java/com/chatlive/support/admin/api/AdminWelcomeController.java`

- `GET  /api/v1/admin/welcome/status`
- `POST /api/v1/admin/welcome/name`
- `POST /api/v1/admin/welcome/website`
- `POST /api/v1/admin/welcome/installation/ack`
- `POST /api/v1/admin/welcome/integrations`
- `POST /api/v1/admin/welcome/company-size`
- `POST /api/v1/admin/welcome/team`
- `POST /api/v1/admin/welcome/complete`

### 3.3 Admin - 邀请坐席

文件：`backend/src/main/java/com/chatlive/support/admin/api/AdminInviteController.java`

- `POST /api/v1/admin/invites/agents`

### 3.4 Sites / Widget（站点、snippet、allowlist、安装检测、配置）

#### Admin Sites（站点列表 / 创建向导 / snippet）

文件：`backend/src/main/java/com/chatlive/support/widget/api/AdminSiteController.java`

- `GET  /api/v1/admin/sites`（admin）
- `POST /api/v1/admin/sites/wizard`（admin，创建站点向导）
- `GET  /api/v1/admin/sites/{id}/widget/snippet`（admin，生成 snippet）

snippet 生成逻辑要点：
- 支持 `app.widget.public-script-base-url` 覆盖外部脚本基地址
- 生成的脚本地址包含：
  - 稳定：`/chatlive/widget.js`
  - 版本化：`/chatlive/widget/{version}/widget.js`
- snippet 支持 data-*：`site-key`、`embed-url`、`auto-height`、`theme-color`、`cookie-domain`、`cookie-samesite`

#### Admin Allowlist + 安装状态

文件：`backend/src/main/java/com/chatlive/support/widget/api/AdminSiteInstallWizardController.java`

- `GET    /api/v1/admin/sites/{id}/allowlist`
- `POST   /api/v1/admin/sites/{id}/allowlist`
- `DELETE /api/v1/admin/sites/{id}/allowlist/{domain}`
- `GET    /api/v1/admin/sites/{id}/install-status`

#### Admin Widget 配置

文件：`backend/src/main/java/com/chatlive/support/widget/api/AdminWidgetConfigController.java`

- `GET /api/v1/admin/sites/{id}/widget-config`
- `PUT /api/v1/admin/sites/{id}/widget-config`

配置字段：
- `pre_chat_enabled`
- `theme_color`
- `welcome_text`
- `cookie_domain`
- `cookie_samesite`（严格枚举：None/Strict/Lax）
- `pre_chat_message`
- `pre_chat_name_label`
- `pre_chat_email_label`
- `pre_chat_name_required`
- `pre_chat_email_required`

#### 非 Admin（agent/admin）可用的 Sites / WidgetConfig

文件：`backend/src/main/java/com/chatlive/support/widget/api/SiteController.java`

- `GET /api/v1/sites`
- `GET /api/v1/sites/{id}/widget-config`

### 3.5 Public（访客侧）

> 访客侧 API 均要求 `visitor_token`（bootstrap 返回），并会校验 visitor 是否属于 site。

#### Public Widget Bootstrap

文件：
- `backend/src/main/java/com/chatlive/support/widget/api/PublicWidgetController.java`
- `backend/src/main/java/com/chatlive/support/widget/service/PublicWidgetService.java`

- `POST /api/v1/public/widget/bootstrap?site_key=...`

请求体：`{ site_key, origin, visitor_id? }`

返回：`{ visitor_token, visitor_id, tenant_id, site_id, widget_config }`

#### Public Conversations（创建/恢复会话、消息、历史）

文件：`backend/src/main/java/com/chatlive/support/publicchat/api/PublicConversationController.java`

- `POST /api/v1/public/conversations`（创建或恢复）
- `GET  /api/v1/public/conversations/{id}`（会话详情）
- `GET  /api/v1/public/conversations/{id}/messages?after_msg_id=&limit=`（消息分页）
- `POST /api/v1/public/conversations/{id}/messages`（发送文本）
- `POST /api/v1/public/conversations/{id}/messages/file`（发送文件消息）

### 3.6 Conversations（坐席工作台）

文件：`backend/src/main/java/com/chatlive/support/chat/api/ConversationController.java`

- `POST /api/v1/conversations`（创建）
- `GET  /api/v1/conversations?status=&starred_only=`（列表）
- `GET  /api/v1/conversations/{id}`（详情）
- `GET  /api/v1/conversations/{id}/messages?after_msg_id=&limit=`（消息）
- `PUT  /api/v1/conversations/{id}/star`（置顶/取消置顶）
- `POST /api/v1/conversations/{id}/close`（关闭，支持 reason）
- `POST /api/v1/conversations/{id}/reopen`（重开）
- `GET  /api/v1/conversations/{id}/meta`
- `PUT  /api/v1/conversations/{id}/tags`
- `PUT  /api/v1/conversations/{id}/note`

快捷回复：
- `GET    /api/v1/quick-replies?q=&limit=`
- `POST   /api/v1/quick-replies`
- `PUT    /api/v1/quick-replies/{id}`
- `DELETE /api/v1/quick-replies/{id}`

### 3.7 Agent（坐席在线状态 / 分配）

文件：`backend/src/main/java/com/chatlive/support/chat/api/AgentController.java`

- `POST /api/v1/agent/session`（创建 agent session，用于心跳与 presence）
- `POST /api/v1/agent/heartbeat`
- `POST /api/v1/agent/logout`
- `GET  /api/v1/agent/status`
- `POST /api/v1/agent/status`（设置自己的状态与 max_concurrent）
- `POST /api/v1/agent/users/{userId}/status`（admin 设置他人）
- `POST /api/v1/agent/conversations/{id}/claim`
- `POST /api/v1/agent/conversations/{id}/assign`（转派）
- `GET  /api/v1/agent/agents`（列出同租户 agents）

### 3.8 Skill Groups（技能组）

文件：`backend/src/main/java/com/chatlive/support/chat/api/SkillGroupController.java`

- `GET  /api/v1/skill-groups`（agent/admin）
- `GET  /api/v1/skill-groups/me`
- `POST /api/v1/skill-groups`（admin）
- `GET  /api/v1/skill-groups/{id}/members`
- `POST /api/v1/skill-groups/{id}/members`（admin）
- `DELETE /api/v1/skill-groups/{id}/members/{agentUserId}`（admin）

### 3.9 Profile（个人资料）

文件：`backend/src/main/java/com/chatlive/support/profile/api/ProfileController.java`

- `GET  /api/v1/profile/me`
- `POST /api/v1/profile/me`
- `GET  /api/v1/profile/users/{userId}`（admin）
- `POST /api/v1/profile/users/{userId}`（admin）

### 3.10 Attachments（附件 presign）

文件：`backend/src/main/java/com/chatlive/support/chat/api/AttachmentController.java`

- `POST /api/v1/attachments/presign-upload`
- `GET  /api/v1/attachments/{id}/presign-download`

### 3.11 Chat Settings（超时/自动归档相关配置）

文件：
- `backend/src/main/java/com/chatlive/support/chat/api/ChatSettingsController.java`
- `backend/src/main/java/com/chatlive/support/chat/api/AdminChatSettingsController.java`

- `GET /api/v1/chat-settings/inactivity-timeouts`（读取租户配置）
- `GET /api/v1/admin/chat-settings/inactivity-timeouts`（admin 读取）
- `PUT /api/v1/admin/chat-settings/inactivity-timeouts`（admin 修改）

---

## 4. WebSocket 实时协议

### 4.1 连接地址

- 坐席：`/ws`
- 访客：`/ws/public`

配置文件：`backend/src/main/java/com/chatlive/support/chat/ws/WsConfig.java`

> 注意：`WsConfig` 里 setAllowedOrigins("*")，但 `WsHandler` 对 visitor 会额外校验浏览器 Origin 是否属于 embed app 允许列表。

### 4.2 连接时鉴权（两种方式）

服务端支持：
1) 连接 URL query 里带 token（便于 visitor embed 快速连）：

`/ws/public?token=...&client=visitor&conversation_id=...`

2) 连接后发送消息：

```json
{ "type": "AUTH", "token": "...", "client": "agent|visitor", "session_id": "..." }
```

实现文件：`backend/src/main/java/com/chatlive/support/chat/ws/WsHandler.java`

### 4.3 客户端上行（常用）

- `AUTH`
- `SUB` / `UNSUB`
- `MSG_SEND`（text/file）
- `SYNC`（分页同步消息）
- `MSG_READ`（读回执）
- `TYPING`
- `PING`

前端 WS 客户端实现：`frontend-agent/src/ws/wsClient.ts`

### 4.4 服务端下行（常用）

- `MSG`（新消息广播）
- `MSG_ACK`（发送确认，包含 msg_id / client_msg_id）
- `SYNC_RES`（同步结果，包含 messages / conversation_events）
- `READ`（读回执事件）
- `TYPING`（输入状态）
- `AGENT_STATUS`（坐席在线/忙碌/容量）
- `CONV_EVENT`（会话生命周期事件，用于时间线）
- `CONV_REOPENED`（访客消息导致重开时通知坐席侧刷新 inbox）
- `ERROR`
- `PONG`

广播器：`backend/src/main/java/com/chatlive/support/chat/ws/WsBroadcaster.java`

---

## 5. Widget 资产与接入

### 5.1 Widget 脚本 URL

文件：`backend/src/main/java/com/chatlive/support/widget/api/WidgetAssetController.java`

- 稳定脚本：`GET /chatlive/widget.js`（短缓存，5 分钟）
- 版本脚本：`GET /chatlive/widget/{version}/widget.js`（长缓存，365 天 immutable）

### 5.2 管理端生成 snippet

接口：`GET /api/v1/admin/sites/{id}/widget/snippet`

返回 `snippet_html`，典型形态（示意）：

```html
<script
  defer
  src="https://your-api.example.com/chatlive/widget.js"
  data-chatlive-site-key="pk_xxx"
  data-chatlive-embed-url="https://your-app.example.com/visitor/embed"
></script>
```

说明：

- 默认推荐使用稳定脚本 `/chatlive/widget.js`，这样后端部署/升级后不需要让租户重新替换安装代码。
- 如确实需要“超长缓存 + immutable”，再使用版本化脚本 `/chatlive/widget/{version}/widget.js`。

### 5.3 安装检测（beacon）

文件：`backend/src/main/java/com/chatlive/support/widget/api/WidgetInstallBeaconController.java`

- `GET /chatlive/ping.gif?site_key=...&origin=...&page=...`
- `GET /chatlive/ping?site_key=...&origin=...&page=...`
- `POST /chatlive/ping?site_key=...&origin=...&page=...`

后端会在 allowlist 允许时记录 last_seen 信息，供 admin install-status 使用。

---

## 6. Public API 的 CORS 与限流

### 6.1 CORS（仅 public）

文件：`backend/src/main/java/com/chatlive/support/common/config/CorsConfig.java`

- 仅对 `/api/v1/public/*` 生效。
- 允许来源：
  - embed app origin（由 `app.widget.public-embed-url` 推导）
  - 额外 origins（`app.ws.public-allowed-origins`）
- bootstrap 端点额外允许：site allowlist 的 origin（为未来“宿主页直接调用 bootstrap”准备）。

### 6.2 Public 限流

文件：`backend/src/main/java/com/chatlive/support/common/config/PublicRateLimitFilter.java`

- bootstrap：60/min（按 site_key + ip）
- create conversation：20/min
- send message：60/min
- list messages：120/min

---

## 7. 前端功能与页面映射（frontend-agent）

### 7.1 路由入口

文件：`frontend-agent/src/App.tsx`

- 访客 embed：`/visitor/embed`（特殊模式：不挂载 Refine/authProvider，避免触发 `/auth/me`）
- 登录/注册/邮箱验证/接受邀请：`/login`、`/signup`、`/verify-email-code`、`/accept-invite`
- Welcome 引导：`/welcome/*`
- 坐席台：`/conversations`（Workbench）
- 归档：`/archives`
- 站点：`/sites`
- 邀请：`/invites`
- 团队：`/team`
- 个人：`/profile`
- 设置：`/settings/*`

### 7.2 WS 自动连接（坐席）

文件：`frontend-agent/src/components/WsAutoConnect.tsx`

行为：
- 登录后调用 `POST /api/v1/agent/session` 获取 session_id（保存在 localStorage）
- 然后连接 WS，并 bootstrap inbox subscriptions（即使没打开工作台也能收通知）

### 7.3 坐席聊天 store（消息/未读/读回执/typing/附件/转派等）

文件：`frontend-agent/src/store/chatStore.ts`

已覆盖的交互：
- 会话列表刷新（status/starred_only）、会话详情加载
- WS subscribe/sync、消息合并去重
- 未读计数（并含跨 tab 同步的逻辑）
- typing 与 read receipt
- tags/note
- 快捷回复 CRUD
- 附件：presign upload + PUT 上传 + WS 发送 file 消息
- claim/assign、agents 列表

### 7.4 站点与安全设置

- 站点/安装 snippet：`frontend-agent/src/pages/SitesPage.tsx`
- 可信域名 allowlist：`frontend-agent/src/pages/TrustedDomainsPage.tsx`
- 站点选择与 widget config 缓存：`frontend-agent/src/store/siteStore.ts`

### 7.5 访客 Embed（iframe 内 UI）

文件：`frontend-agent/src/pages/VisitorEmbedPage.tsx`

关键能力：
- bootstrap（拿 visitor_token + widget_config），visitor_id 持久化（cookie + localStorage）
- 会话 createOrRecover 策略：首次发送才创建；刷新时尽量复用 conversationId
- WS 优先 + HTTP fallback
- typing/read/unread/动态高度：通过 postMessage 与宿主页通信

---

## 8. 主要配置项（环境变量/配置文件）

配置文件：
- `backend/src/main/resources/application.yml`
- `backend/src/main/resources/application-dev.yml`

常用项（详见 README）：
- `JWT_SECRET`
- `SPRING_DATASOURCE_*`
- `app.widget.public-script-base-url`（生成 snippet 的脚本基地址）
- `app.widget.public-embed-url`（iframe embed URL，用于 CORS/WS visitor origin 校验）
- `app.ws.public-allowed-origins`（额外允许的 origin 列表，逗号分隔）
- `app.jwt.visitor-ttl-seconds`（visitor token 过期时间）
- `app.chat.visitor-idle.*`、`app.conversation.inactivity-archive.*`（默认超时策略）

---

## 9. 数据模型概览（Flyway migrations 侧视图）

迁移目录：`backend/src/main/resources/db/migration/`

从 migrations 可见主要实体：
- tenant / user_account / agent_profile
- conversation / message / message_state
- site / site_domain_allowlist / visitor / widget_config
- attachment
- conversation_mark / conversation_tag / conversation_note / quick_reply
- site_installation（安装检测）
- tenant_onboarding、email_verification_code/token、agent_invite
- chat_inactivity_timeouts、assignment_strategy_config

---

## 10. 当前实现边界/注意事项（基于代码观察）

- WebSocket 采用自定义协议，不是 STOMP。
- `WsConfig` 允许任意 Origin，但 visitor 会在 `WsHandler` 做二次校验；public HTTP 也有 CORS 筛选。
- 权限控制主要是 Controller 内基于 claims.role 的判断（admin/agent/customer/visitor）。

---

## 11. 建议的后续维护方式

- 每次新增/变更 API：同步更新本文件的对应章节。
- 每次新增 WS 事件：在“WebSocket 实时协议”里补充消息 schema（字段说明与示例）。
- 如果将来引入 Spring Security 的统一 `SecurityFilterChain`：可新增一节记录全局鉴权与路径策略，减少每个 Controller 手动解析 token。
