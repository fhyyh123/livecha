# 1. ChatLive SaaS（对标 LiveChat）工作计划：嵌入式客服（Widget）

### Step 1：运营能力 P1（2-4 周）

- 报表：会话量、首响/解决时长、导出；审计日志；基础告警
- 验收：能回答“最近 7 天坐席效率/流量变化”，并能导出数据

### Step 2：官网/产品页 P2（最后做，1-2 周）

- 信息架构：首页/产品/定价/安全/文档/演示
- 验收：SEO 友好、加载快、从官网到 demo/登录 路径清晰

---

## 2. 风险与对策

- 跨域/安全：必须做 origin allowlist 与 visitor_token；严禁仅凭 tenantId 直连
- 滥用风险：匿名开启时要做限流（按 ip+site、visitor_id），可选验证码
- 数据隔离：所有查询必须带 tenant/site 约束，避免越权
- iframe 兼容：部分站点 CSP 可能限制 iframe/script，需要文档指导

---

## 3. 当前仓库对应关系（落地建议）

- backend：public widget/visitor API + 数据模型迁移 + WS 鉴权分支 + 安装上报 beacon
- frontend-agent：坐席工作台 + 站点管理（snippet/widget_config/allowlist/install-status）
- infra：Nginx 代理 /api、/ws、/chatlive；以及 demo 验证链路（可选“第三方网站”容器）
- prod-bundle-A：离线打包与部署脚本

---

## 4. 下一次沟通需要确认的产品规则（不改代码前先定规则）

1) site 粒度：一个租户允许多少站点？是否需要渠道（web/app/mp）分别配置？
2) 匿名关闭时：必须收集哪些字段（email/phone/name）？是否要 OTP 验证？
3) 数据保留策略：会话与消息保留多久？是否支持导出？
4) 多语言与时区：工作时间与欢迎语是否需要多语言？
