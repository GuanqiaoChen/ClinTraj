# clintraj.icu 部署准备

> 当前只公开 `/demo` 与只读 `/workspace` 时，使用 [展示站部署步骤](showcase-deployment.md) 和独立 `docker-compose.showcase.yml`，无需模型、数据库或真实后端。

> 2026-09-17：长期部署与本次上线规划以 [clintraj.icu 完整部署方案](clintraj-icu-deployment-plan.md) 为准，覆盖国内外访问、公开官网/回放、受邀研究环境和未来产品隔离。下文保留早期单域研究部署记录；其中默认口令、整个仓库挂载和单域入口须按新方案改造后才能用于公网，不能直接作为生产上线命令。

域名在 IONOS 管理。用户尚无服务器，本次只准备配置；没有修改 DNS，也没有把本地服务发布到公网。

## 本地

```bash
docker compose up -d --build
# 医生界面 http://localhost:3000/workspace
# 观察界面 http://localhost:3000/observation
```

BGE-M3 与 reranker 需要额外模型存储和内存，CPU 推理延迟取决于硬件。首次下载不计入交互性能评测；先预热和建立索引，再测试。

```bash
docker compose --profile research up -d --build retrieval
docker compose exec backend python -m clintraj.server.reindex_m3
# 预热 reranker（仅发送公开示例文本）
curl -X POST http://localhost:8010/rerank -H 'Content-Type: application/json' -d '{"query":"pneumonia","texts":["Pneumonia imaging and microbiology"]}'
```

`reindex_m3` 每批提交，重跑可续传，不覆盖旧向量。新增文献导入后需再运行。未建索引或模型服务未就绪时，观察页明确显示降级，不能将该轮计入 BGE 完整栈结果。

## 服务器准备完成后

1. 在服务器安装 Docker Engine 与 Compose，克隆 GitHub 仓库，将 `.env.example` 复制为服务器自己的 `.env`。不要复制本地真实患者数据和测试数据库到公网服务器。
2. 配置模型和域名。服务器仅开放 SSH 与 80/443；数据库、Ollama、BGE 与后端端口保持 loopback。
3. 生成研究环境访问密码 hash：`docker run --rm -it caddy:2-alpine caddy hash-password`。在 `.env` 中填写 `CADDY_AUTH_USER` 和 `CADDY_AUTH_HASH`，hash 用单引号包裹以保留 `$`。这是共享研究入口，不是医院级用户身份系统。
4. IONOS 控制台进入 Domains & SSL → clintraj.icu → DNS，将根域 `@` 的 A 记录指向服务器公网 IPv4。只有配置了可访问 IPv6 时才设置 AAAA；不要填写 localhost/127.0.0.1。不要改动邮箱 MX/TXT 记录。
5. 启动服务：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile research up -d --build
docker compose -f docker-compose.yml -f docker-compose.production.yml exec backend python -m clintraj.server.reindex_m3
```

Caddy 对 `clintraj.icu` 自动申请 HTTPS，代理 Next.js 与流式 API。入口为 `https://clintraj.icu/workspace` 和 `https://clintraj.icu/observation`。DNS 生效且证书签发后再确认域名已连接。需要裸 `localhost/workspace` 而非端口 3000 时，可在本机另外配置 80 端口反向代理；本项目默认保留现有 3000 端口以免占用用户其他服务。

验证：访问两页、创建合成会话、检查 SSE 连续事件、多选推进、确认模拟标签、刷新后检查轨迹一致。运行 `scripts/smoke_session.py` 可验证本地 HTTP 工作流。

依据：[IONOS A/AAAA 设置](https://www.ionos.co.uk/help/domains/configuring-your-ip-address/changing-a-domains-ipv4ipv6-address-aaaaa-record/)、[Caddy basic_auth](https://caddyserver.com/docs/caddyfile/directives/basic_auth)、[Caddy 环境变量](https://caddyserver.com/docs/caddyfile/concepts)。
