# V2 架构校验记录

校验环境：Windows + Docker Compose，本地 PostgreSQL / Neo4j / Ollama / BGE 服务。所有新增 HTTP 与浏览器测试使用合成病例，不导出患者原文或私有轨迹。以下是工程行为验证，不是临床准确率或期刊标准认证。

交付状态：按用户要求停止扩展校验并提交。Python 全套最近一次为 129 项通过，之后与末轮修改相关的 22 项定向检查通过；Mypy 与 Ruff 通过。BGE 全量索引及索引完成后的三专科完整检索性能测试未完成，末次后台任务遇到数据库连接超时，不能声称已完成全量验收。尚未部署到公网。最后一处模拟行动 ID 的类型保护修复已通过 Mypy，但未再次重建运行中的镜像。

## 自动检查

- Ruff 静态检查、Mypy（59 个源文件）通过。
- Python 全套服务测试覆盖真实 PostgreSQL、Neo4j 和 LangGraph 持久化检查点；临床行为单元/集成测试使用确定性测试模型。
- 前端 TypeScript、ESLint、Vitest（21 项）通过，Next.js 生产构建包含 `/workspace` 与 `/observation`。
- 生产 Compose 配置解析通过；服务器未配置，未修改 IONOS DNS，未发布公网服务。
- Caddy 配置用临时测试口令 hash 完成真实解析和加载校验。

复现命令：

```powershell
.venv/Scripts/python.exe -m ruff check clintraj tests scripts
.venv/Scripts/python.exe -m mypy clintraj
$env:CLINTRAJ_INTEGRATION='1'
.venv/Scripts/python.exe -m pytest -q
cd web
npm run type-check
npm run lint
npm test
```

## 已验证的行为

| 场景 | 判定 |
|---|---|
| 模型超时、无效结构、候选不足或编号碰撞 | 补足三个不同方案，显式标记降级 |
| 独立审查发现 veto | 三候选保持可选，发现保存在观察事件 |
| 同时接受三个候选 | 三个向前节点，逐个生成节点事件 |
| 医生全部拒绝、自填、无效图关系元数据 | 拒绝不推进；自填保留原文；图元数据不能取消医生决定 |
| 重复提交、刷新和持久化 | 不重复执行、不重复模拟证据 |
| 未来证据、会话隔离、来源出处 | 未来结果不泄漏，错配决策被数据完整性检查拒绝 |
| 真实会话请求模拟 | API 拒绝；仅合成会话启用 |
| 专科路由与排序 | 模型可选零或多个专科；任务权重改变排序；引用编号不因排序改变 |
| 公共/历史检索 | 召回与 rerank 候选池分别保留两个来源域的配额 |

浏览器实测：合成呼吸病例的两轮真实 DeepSeek 提案分别约 13.9 秒、19.6 秒生成三候选，并调用慢阻肺和肺炎专科。接受两个方案后推进两步；下一轮自填检查决策推进一步。工作台与观察台分离，原生图更新与审计事件可见，页面刷新后状态保留。

后续真实 HTTP 测试：DeepSeek 一轮 16.5 秒生成三个模型候选，接受两个、模拟证据生成和重复提交检查通过。本地模型在建索引负载下约 30.1 秒转为三个备用候选，继续与幂等检查通过，模拟器未返回有效结果。两轮均因检索超时没有获得完整 BGE 检索结果；应分别计入模型成功、提案降级与检索降级。

曾在 BGE 建索引争用 CPU 时出现检索超时；未使三候选消失。曾发现模拟器只复述计划或超时，已调整专用模拟提示、输出预算和时限，失败仍显式标记为待观察。不能将降级轮次计为完整模型或检索成功。

真实模型与检索复现：

```powershell
.venv/Scripts/python.exe scripts/smoke_session.py --provider deepseek --timeout 150
.venv/Scripts/python.exe scripts/smoke_session.py --provider local --timeout 150
.venv/Scripts/python.exe scripts/verify_retrieval.py --wait-index
```

报告保存在被 Git 忽略的 `outputs/`，只包含聚合计数、模式、耗时和本地合成会话 ID。公开源码不包含会话导出。

## 解释范围

三候选可用性不代表三个方案都正确。计时是单机小样本观察，没有 p95 或并发 SLA 结论。BGE 全栈可运行也不等于检索质量已经超过基线；需要独立标注集的 Recall/nDCG 与医生盲评。影像目前处理报告文本，未实现 CT 像素诊断。研究方案和 schema 依据见 [架构文档](research-architecture-v2.md)。
