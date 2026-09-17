# 只发布 /demo 和 /workspace 的展示站

当前目标：其他人可以访问 `https://clintraj.icu/demo` 和 `https://clintraj.icu/workspace`，看演示与界面；不开放真实使用、患者输入、会话提交或模型调用。本方案是近期上线方式；长期官网/研究/临床架构仍见 [完整方案](clintraj-icu-deployment-plan.md)。

## 已实现的展示模式

| 地址 | 公开站行为 |
|---|---|
| `/` | 转到 `/demo` |
| `/demo` | 中文慢阻肺演示，可播放、定位和重播 |
| `/workspace` | 当前工作台风格的只读合成病例；可切换两轮预置画面、展开录入界面与参考来源 |
| `/demo/trajectory` | 保留原有合成轨迹图回放，供 demo 导航使用 |
| `/api/*` | 服务端直接返回 404，不转发任何读写或 SSE 请求 |
| `/observation` | 返回 404 |

公开容器设置 `CLINTRAJ_SHOWCASE_ONLY=true`。此开关在服务器运行时读取；浏览器修改参数无法切换回真实模式。Next.js 页面动态读取该开关，避免在构建时把真实工作台缓存为公开页面。正常本地环境未启用开关时，原医生工作台和 API 行为不变。

展示工作台使用独立组件，没有 fetch、EventSource、模型调用或会话存储。所有输入只读、临床提交按钮禁用。服务端 API 拦截和网关路径限制另外生效，因此不只是把按钮变灰。预置数据来自原创合成演示脚本，不导出任何本地患者会话。

## 只需一个前端站点

```text
访客 → clintraj.icu → Caddy（HTTPS）→ Next.js 展示前端
```

使用独立的 `docker-compose.showcase.yml`，里面只有 `frontend` 和 `caddy`。没有 FastAPI、PostgreSQL、Neo4j、Ollama 或检索服务，没有临床数据目录挂载，也不读取后端 `.env` 为容器注入密钥。不需要 GPU、模型 API key 或公网开放 3000/8000。

按此前国内外同样重要的要求，可继续选香港节点并实测线路。运行这两个页面可以从小型 Linux VPS 开始；若在服务器上直接执行构建，建议 2 核 / 4 GB 内存，留出 Node 构建空间。服务器不必与域名注册商相同。普通仅支持上传 HTML/PHP 的主机不能直接运行当前 Next.js standalone 版本。[Next.js 自托管](https://nextjs.org/docs/app/guides/self-hosting)

## 上线步骤

### 1. 准备服务器

准备带固定公网 IPv4 的 Linux VPS，安装 Docker Engine 和 Compose 插件。开放 TCP 80/443，SSH 仅允许管理员来源；3000 不发布到宿主机。按照 [Docker 官方 Ubuntu 安装步骤](https://docs.docker.com/engine/install/ubuntu/)操作。

从干净仓库 checkout 构建，只带源代码。不要上传开发目录中的 `.env`、患者工作簿、会话导出、`outputs/` 或 Docker 数据卷。构建上下文限定 `web/`，其 `.dockerignore` 排除 `.env*`。

```bash
git clone https://github.com/GuanqiaoChen/ClinTraj.git
cd ClinTraj
docker compose -f docker-compose.showcase.yml config --quiet
```

仓库如为私有，使用自己的 GitHub 克隆权限；不要把凭据写进命令、Compose 或文档。

### 2. 修改 IONOS DNS

进入 Domains & SSL → `clintraj.icu` → DNS。先记录旧值，再配置：

| 类型 | 主机名 | 值 |
|---|---|---|
| A | `@` | 服务器公网 IPv4 |
| AAAA | `@` | 只有服务器 IPv6 已验证可用才填写；否则删除原来的旧 AAAA |

`/demo` 和 `/workspace` 是网页路径，**不需要分别创建 DNS 记录，也不需要两个服务器**。保留邮件 MX、SPF/DKIM/DMARC 等记录。检查旧 A/AAAA 与 IONOS 停放服务的冲突，传播受缓存影响。[IONOS A/AAAA 官方操作](https://www.ionos.co.uk/help/domains/configuring-your-ip-address/changing-a-domains-ipv4ipv6-address-aaaaa-record/)

### 3. 启动展示站

在仓库根目录执行：

```bash
docker compose -f docker-compose.showcase.yml up -d --build
docker compose -f docker-compose.showcase.yml ps
docker compose -f docker-compose.showcase.yml logs --tail=60 caddy frontend
```

**只使用这一份 Compose，不与 `docker-compose.yml` 或 `docker-compose.production.yml` 合并。** 默认域名已经是 `clintraj.icu`，不需要准备 `.env`。若服务器 shell 中已有其他用途的 `PUBLIC_DOMAIN`，先将其明确设为 `clintraj.icu`。

Caddy 读取 `deploy/Caddyfile.showcase`，自动申请和续期证书。条件是 DNS 指向入口、80/443 可达、证书卷可持久化；如原域名设有 CAA，需允许所用 CA。[Caddy HTTPS 说明](https://caddyserver.com/docs/automatic-https)

### 4. 验收

```bash
curl -I https://clintraj.icu/demo
curl -I https://clintraj.icu/workspace
curl -i https://clintraj.icu/api/sessions
curl -i -X POST https://clintraj.icu/api/sessions/example/runs
curl -i https://clintraj.icu/observation
```

前两项应为 200；后三项应为 404。浏览器检查：

- demo 可以完整播放、拖动和重播，字体/脚本/样式正常。
- workspace 显示“界面展示”，只能切换预置画面、查看来源与录入界面。
- 生成、创建会话、添加证据、接受/拒绝等按钮不可提交。
- 浏览器网络面板没有 `/api/*` 请求；直接构造 API 请求也被拒绝。
- `docker compose -f docker-compose.showcase.yml ps` 只有前端与 Caddy。

## 更新与回滚

记录当前 Git commit，更新时：

```bash
git pull --ff-only
docker compose -f docker-compose.showcase.yml up -d --build
```

这是单实例展示站，更新可能短暂中断。需要回滚时，在干净的服务器 checkout 切回记录的已验证 commit，再运行同一构建命令。不要删除 Caddy 证书卷，不使用 `down -v` 做日常更新。

## 本地检查公开模式

普通开发服务 `http://localhost:3000` 保持原模式。也可先构建，在另一个终端以展示模式运行：

```powershell
cd web
npm run build
$env:CLINTRAJ_SHOWCASE_ONLY = 'true'
npm run start -- --port 3001
```

检查 `http://localhost:3001/demo` 与 `http://localhost:3001/workspace`；`http://localhost:3001/api/health` 也应为 404，这正是公开模式的预期行为。此变量只影响设置它的终端及其子进程，结束后可关闭该终端。

目前仍需服务器公网 IP、服务器访问权限和 IONOS DNS 管理权限才能执行公网发布；配置准备完成不等于域名已经上线。
