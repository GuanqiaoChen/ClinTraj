# ClinTraj：医生主导的多专科决策研究架构

本版本将产品的可操作性和科研的可审计性分开：每步给出三个候选，医生决定采用哪些；规则、引用缺失、超时和模型批评保留为观察事件。使用先进模型只是实验条件，不等于临床有效性或达到某一期刊的录用标准。

## 运行架构

```mermaid
flowchart LR
  E[当前可见证据] --> T[全科主分诊]
  T --> K[共享知识库与知识图谱]
  K --> S[按需调用专科]
  S --> C[三个候选决策]
  K --> C
  C --> D[医生单选 / 多选 / 拒绝 / 自填]
  D --> G[记录临床轨迹]
  G --> M[合成会话：小模型模拟新证据]
  M --> E
  C -.独立审计.-> O[/observation]
  T -.原生 LangGraph 事件.-> O
  S -.结果与超时.-> O
```

`/workspace` 是医生界面；`/observation` 是工程和科研观察界面。观察页消费原生 `StateGraph.stream(stream_mode=["updates", "custom"])` 事件，经现有 PostgreSQL 事件表和可续传 SSE 传输，展示运行轮次、路由原因、阶段、检索配置、排序分解、规则意见和模拟来源。原生 LangGraph 检查点与 `interrupt` 保留医生审核；不把患者资料发送到外部 LangSmith。当前实现实际产生的是 updates 事件，custom 通道预留给扩展工具。

模型调用默认共享 30 秒提案预算：分诊最多 4 秒、检索最多 8 秒、被选中的专科并行最多 5 秒，生成器使用剩余时间。数据库写入、队列调度和网络返回仍有额外开销，此数值不是硬实时服务承诺。共用有界线程池，超时不持续建立无限线程；已发出的 HTTP 请求在其自身时限内结束。生产容量应按设备实测调整。

模型无响应、JSON 不合法或只输出一两个方案时，补足至三个不同的候选，并标记 `generation_mode=degraded`。备用候选是复评、补病史、针对性查体，不能伪装成完成了专科诊疗推断。降级率必须单独报告；不能通过备用方案把模型成功率报成 100%。

## 决策合同

- `Recommendation.candidates` 在在线服务输出恒为三个；`selected_candidate_id` 只表示排序首选，不代表医生已经接受。
- `PhysicianDecision.selected_candidate_ids` 支持接受一个、两个或三个。`MODIFY` 携带完整自主决策；`REJECT` 不改变临床图。
- 医生选择后不再等待模型批准。确定性规则和异步独立模型批评均为 advisory，保留 `would_veto` 以便研究旧策略会阻止多少步。
- 多选按提交顺序记录，每个行动都有一个向前节点。相同决策重复提交复用持久化结果。非法候选 ID、错配会话、过期推荐及未来证据仍属于数据完整性错误。
- 错误图关系不抹掉医生原文：原始决策不可变地存储；图投影无法表达时，记录带有原决策文本的重新评估节点，不编造已发生的转科或医嘱。
- 原有 `ClinicalCoordinator` 离线实验仍保留阻断策略，用于受控基线；在线 `LiveCoordinator` 使用本页定义的医生主导策略。两者结果不得直接混称同一实验系统。

## 可扩展专科

`configs/specialists.yaml` 是带版本的注册表，包含触发词（仅作为超时备用路由）、角色描述、任务维度权重和允许使用的图关系。模型分诊可以选零个、一个或多个专科。新增专科只需扩展注册表；共用 `specialist` 角色协议、知识库和图谱，不复制疾病资料。

| 专科 | 优先维度 | 解释边界 |
|---|---|---|
| 慢阻肺 | 肺功能、氧合、急性加重、暴露、用药 | 影像不能代替气流受限证据；缺失维度显式保留 |
| 肿瘤 | 病理、分期、标志物、治疗线次、影像、体能状态 | 影像怀疑不等于病理确诊；分期和线次有事件上下文 |
| 肺炎 | 影像、氧合、病原学、严重程度、症状 | CT 是影像模态之一，不能默认所有患者都必须做 CT，也不能仅凭影像忽略临床证据 |

## 共享知识 schema

医渡公开材料说明其疾病图谱、临床数据结构化和疾病字段治理能力，但没有公开足以复刻的完整实体字段与关系合同。本项目参考其“通用数据底座 + 疾病维度”的方向，不声称实现医渡私有 schema。公开可复现的语义锚点采用 FHIR DiagnosticReport / ImagingStudy / Observation，以及 OMOP 的 Condition、Measurement、Observation、Drug、Procedure、Oncology 扩展。

三个数据域保持隔离：公共医学知识、其他患者的历史案例、当前患者观察。后两者不能因为相似性被当成当前患者的已知结果。当前患者和模拟观察都不会写进知识检索索引。

| 层 | 实体 / 字段 | 约束和用途 |
|---|---|---|
| 来源 | `KnowledgeSource`: corpus、title、version、citation、license、SHA-256 | 可追溯版本与授权；引用不依赖模型生成 URL |
| 片段 | `KnowledgeChunk`: document、text、concept_ids、metadata.facets | 片段与文档绑定；内容 hash 核验 |
| 编码 | legacy 384D、`embedding_m3` 1024D、`sparse_m3`、`retrieval_model` | 增量共存；不同维度与模型不混算 |
| 概念 | disease、symptom、test、drug、procedure、imaging_finding、anatomy、pathogen、histology、stage、biomarker、exposure | 显式术语系统及版本；不得从名字猜 SNOMED/LOINC 编码 |
| 断言 | `MedicalAssertion`: subject、relation、object、applicability、curator、supporting_chunk、source_excerpt、facets | 必须有公共来源的精确片段；图关系是有条件的来源断言，不是无条件规则 |
| 任务维度 | specialties、dimensions、modality、body_site、finding、laterality、negated、certainty | CT/XR/MRI/US/病理/肺功能/实验室分别标记；阴性与缺失分开 |
| 适用条件 | population、age_min/max、severity、stage、histology、biomarker、treatment_line | 提供上下文；现阶段除维度和关系外，不宣称已实现完整人群因果匹配 |
| 证据等级 | evidence_level、recommendation_strength、effective_from/until | 未标注即未知，不能自动冒充高质量指南 |
| 标注来源 | annotation_method = curated / source / topic_terms / unannotated | 自动主题词只能给文献分类，不构成诊断断言；与人工标注分层评估 |
| 互操作 | fhir_resource、omop_domain、terminology_system/version | 保留映射锚点；并非已完成 FHIR 接口或 OMOP ETL 认证 |

新增关系：HAS_IMAGING_FINDING、LOCATED_IN、HAS_PATHOGEN、HAS_HISTOLOGY、HAS_STAGE、HAS_BIOMARKER、MODIFIES_EFFECT、DIFFERENTIAL_OF；保留 HAS_PHENOTYPE、EVALUATED_BY、RECOMMENDS、RECOMMENDS_AGAINST、CONTRAINDICATED_WITH、INTERACTS_WITH。不能将 `RECOMMENDS_AGAINST` 自动等同于绝对禁忌。

当前模型接收文本及影像报告。schema 支持影像主题与模态，尚未实现 DICOM 像素读取、视觉模型诊断或影像分割；不能把报告检索描述成已经完成 CT 图像推理。

## 检索、召回与重排序

1. 公共和历史域分别检索，私有历史仅对本地模型开放，排除当前患者文档 ID。
2. PostgreSQL FTS（包含中文 bigram）、BGE-M3 dense（pgvector HNSW）、BGE-M3 learned sparse（JSONB GIN）、Neo4j 来源断言/概念/病例轨迹召回。
3. 去重后使用 RRF，常数 k=60。稀疏候选读取上限为 2000，属于有界近似检索，规模扩大后需要评估召回损失或迁移专用稀疏索引。
4. 对融合后的默认 12 个片段（可配置 4–48）使用 `BAAI/bge-reranker-v2-m3` cross-encoder 重排序。
5. 综合分数 = 0.80 × reranker 相关度 + 0.15 × 专科维度匹配 + 0.05 × 归一化 RRF。多专科取维度匹配最大值；各专科对共享 bundle 再按自身 profile 排序。
6. 保存 `score_breakdown`、使用的 encoder/reranker、实际召回通道和降级原因。来源不足时不声称“有支持”。

上述权重是明确的实验超参数，未经过临床校准。BGE-M3 支持 dense/sparse/ColBERT；当前实现启用前两者，未声称启用了 ColBERT。FTS 是词法基线，不能称为 BM25。服务不可用时显式退化到词法/图谱，观察台显示实际状态。

## 模拟证据

仅 `synthetic=true` 的会话可启用 `simulate_evidence`，测试示例默认开启。医生选择或自填后，本地小模型独立接收已经接受的行动与当前观察，生成下一轮模拟证据。未选方案、未来检查结果和 golden 结局不作为输入。

每条模拟证据固定有 `synthetic=true`、中文模拟标签、来源模型、提示词版本/hash、父运行 ID 和确定性证据 ID。重复完成不会插入第二份。模型超时时只记录“结果待回报”，不伪造检查数值。模拟失败释放会话；服务重启中断模拟会产生审计记录，不隐式补造结果。真实会话 API 拒绝模拟请求。

模拟只能用于交互与压力测试；它不是独立临床终点。论文中模型模拟轨迹、真实回放和前瞻医生研究应分层报告，不能使用同一模型生成的结果验证自身正确性。

## 面向投稿的验证设计

预先指定假设：任务维度匹配能否在同一语料、token 与时限下提高专科证据的排序质量，并降低医生全部拒绝率；按需专科协作是否优于总是全调用。

消融：FTS；dense-only；dense+sparse；加图谱；加 reranker；加任务维度；不路由/全路由/模型路由；阻断策略/仅审计策略。所有组记录超时和降级，固定语料 release、prompt hash、encoder/reranker 版本、预算、随机种子及硬件。先在独立验证集调参，测试集锁定后不再调权重。

检索终点：Recall@20/50、nDCG@10、MRR、跨专科混淆和无关来源比例。决策终点：三个候选覆盖率、Top-3 专家可接受率、单选/多选/全部拒绝比例、自填率、被接受的潜在高风险建议比例。系统终点：p50/p95 延迟、每轮 token/成本、模型成功率、备用占比、模拟失败率。字段权重和排序分数不能当诊断概率。

切分按患者、机构和时间，排除同病例相邻节点泄漏；专家盲评至少两人并报告一致性与仲裁；使用患者聚类 bootstrap 置信区间，配对比较同一病例、预先定义主要终点与多重比较控制。当前 400 例工作簿缺少已完成的专家审核，不能据文件名当作专家金标准。

来源（2026-09-15 查阅）：[LangGraph Streaming](https://docs.langchain.com/oss/python/langgraph/streaming)、[BGE-M3](https://huggingface.co/BAAI/bge-m3)、[BGE reranker](https://huggingface.co/BAAI/bge-reranker-v2-m3)、[FHIR DiagnosticReport](https://www.hl7.org/fhir/diagnosticreport.html)、[OMOP CDM](https://ohdsi.github.io/CommonDataModel/)、[OMOP Oncology](https://ohdsi.github.io/OncologyWG/model.html)、[OMOP Imaging WG](https://ohdsi.github.io/ImageWG/)、[医渡 YiduCore](https://www.yidutech.com/yidu-core.html)。
