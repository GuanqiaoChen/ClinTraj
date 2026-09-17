import { buildCase, type StepInput } from './build-case';
import type { DemoCase } from '../../lib/demo/types';

// IDs are selectors explicitly supplied in Prompt 2. Every narrative below is newly
// authored synthetic content. These are not exports or corrected versions of source cases.
const initial = (problem: string): StepInput[] => [
  { actionType: 'ASK_HISTORY', title: '明确主诉与现病史', evidence: [`合成病例：患者因${problem}就诊。`, '目前病史尚不完整。'], action: '围绕症状演变、相关既往史与当前顾虑进行针对性问诊。', rationale: '在建议进一步检查之前，先把当前的观察背景弄清楚。' },
  { actionType: 'EXAM', title: '进行针对性体格检查', evidence: ['针对性病史已经采集。', '查体结果尚未录入。'], action: '请临床医生围绕主诉进行针对性查体。', rationale: '把病史与当前查体结合起来，再决定后续检查。' },
  { actionType: 'TEST', title: '完善初步针对性检查', evidence: ['查体结果支持进一步评估。', '病因目前仍不明确。'], action: '提出有针对性的检查方案，供医生审核。', rationale: '用现阶段可得的证据减少影响决策的不确定性。' },
];

const linear = buildCase({
  caseId: 'ZY080001040320', title: '乳腺问题的顺序诊疗路径', shortTitle: '乳腺诊疗',
  description: '从针对性问诊开始，依次经过操作、病理复核与随访安排的顺序化诊疗。',
  pattern: '线性推进', primaryProblem: '乳腺问题', owner: 'breast_surgery',
  steps: [
    ...initial('乳腺相关问题'),
    { actionType: 'PROCEDURE', title: '安排必要的操作', evidence: ['初步检查发现需要组织学评估的病灶。', '演示数据记录操作前评估已完成。'], action: '在核对前置条件后，提出组织取样操作供医生审核。', rationale: '组织学评估可以解决初步检查留下的不确定性。' },
    { actionType: 'PATHOLOGY', title: '解读组织学结果', evidence: ['合成的操作已完成。', '标本报告现已可用。'], action: '与主管临床团队一起解读现有病理结果。', rationale: '在既有乳腺问题的背景下解读新获得的组织学结果。' },
    { actionType: 'REASSESS', title: '整合现有结果', evidence: ['标本结果已复核。', '当前恢复情况的观察信息已可用。'], action: '结合当前结果与患者关切，重新评估治疗方案。', rationale: '在新结果出现后更新方案，但不预设未来结局。' },
    { actionType: 'DISCHARGE_FOLLOWUP', title: '安排长期随访', evidence: ['演示数据记录了已复核的随访计划。', '没有引入新的急性问题。'], action: '为主管医生提出书面随访与复查计划。', rationale: '让本次就诊之后的随访与责任归属保持明确。' },
  ],
});

const advisory = buildCase({
  caseId: 'ZY020001071253', title: '消化系统诊疗中的耳鼻喉会诊分支', shortTitle: '消化 + 耳鼻喉',
  description: '新出现的耳鼻喉问题形成独立路径，同时消化内科保持主管权。',
  pattern: '会诊分支', primaryProblem: '消化系统问题', owner: 'gastroenterology',
  steps: [
    ...initial('消化系统相关问题'),
    { actionType: 'REASSESS', title: '新建独立的耳鼻喉问题', evidence: ['现病史中包含一个独立的耳鼻喉症状。', '消化系统问题仍在处理中。'], action: '在现有诊疗过程下，把耳鼻喉问题登记为一个独立问题。', rationale: '独立问题可以获得针对性意见，同时不改变原团队的责任归属。', problemId: 'P2', problemLabel: '耳鼻喉问题', parentProblemId: 'P1', relation: 'BRANCH', y: 210 },
    { actionType: 'CONSULT', title: '请耳鼻喉科会诊', evidence: ['新出现的耳鼻喉问题需要专科意见。'], action: '请耳鼻喉科会诊，消化内科仍保留主管权。', rationale: '会诊提供的是专科意见，不改变主管团队。', problemId: 'P2', relation: 'CONSULT', specialty: 'otolaryngology', y: 210 },
    { actionType: 'PROCEDURE', title: '继续消化系统检查', evidence: ['初步消化系统检查支持进一步的操作评估。', '演示数据记录操作前置条件已复核。'], action: '提出消化系统相关操作供医生审核。', rationale: '在处理会诊分支的同时，原问题可以继续推进。', parents: [3], y: 0 },
    { actionType: 'PATHOLOGY', title: '解读消化系统标本', evidence: ['消化系统操作已完成。', '合成的标本结果现已释放。'], action: '与消化内科团队一起复核标本结果。', rationale: '用新释放的病理结果指导当前的消化系统方案。', y: 0 },
    { actionType: 'TREATMENT', title: '更新消化系统治疗方案', evidence: ['消化系统结果已复核。'], action: '提出与当前结果一致、经医生复核的治疗方案。', rationale: '把治疗建议与可用证据和当前管理问题绑定。', y: 0 },
    { actionType: 'REASSESS', title: '结束会诊评估', evidence: ['耳鼻喉科意见已获得。', '本演示中没有安排进一步的耳鼻喉工作。'], action: '记录耳鼻喉会诊阶段已完成。', rationale: '在整合之前，明确结束该会诊问题。', problemId: 'P2', parents: [5], status: 'RESOLVED', y: 210 },
    { actionType: 'REASSESS', title: '整合两条路径', evidence: ['当前消化系统方案与已完成的耳鼻喉意见都已可用。'], action: '在一个新的整合决策节点上重新评估整体方案。', rationale: '通过向前整合把最新的分支与主线信息合并，而不是回到历史节点。', relation: 'RETURN', parents: [9, 8], y: 105 },
    { actionType: 'DISCHARGE_FOLLOWUP', title: '安排随访', evidence: ['整合后的方案指出仍需持续复查。'], action: '在原消化内科团队下记录随访安排。', rationale: '会诊并不取代长期的主管责任。' },
  ],
});

const ownership = buildCase({
  caseId: 'ZY010001076087', title: '肺部诊疗合并骨折处理路径', shortTitle: '肺部 + 骨折',
  description: '骨科意见最终演变为对一个独立骨折问题的主管权转交，随后回归当前主线管理。',
  pattern: '会诊 → 转交 → 回归', primaryProblem: '肺部问题', owner: 'pulmonology',
  steps: [
    ...initial('肺部相关问题'),
    { actionType: 'REASSESS', title: '识别独立的骨折问题', evidence: ['当前影像发现一个独立的椎体问题。', '肺部问题尚未解决。'], action: '在当前诊疗过程下新建一个骨折管理问题。', rationale: '不同的管理需求需要一个明确的问题分支。', problemId: 'P2', problemLabel: '椎体骨折问题', parentProblemId: 'P1', relation: 'BRANCH', y: 210 },
    { actionType: 'CONSULT', title: '请骨科会诊', evidence: ['骨折问题需要专科评估。'], action: '请骨科提供意见，当前团队仍保留主管权。', rationale: '专科意见应与主管责任的变更分开记录。', problemId: 'P2', relation: 'CONSULT', specialty: 'orthopedics', y: 210 },
    { actionType: 'TRANSFER', title: '转交骨折问题的主管权', evidence: ['骨科评估意见已获得。', '演示数据记录双方同意由专科接管。'], action: '把骨折问题的主管权转交给骨科。', rationale: '主管权只能通过这一明确的转交发生变化；肺部问题的主管团队保持不变。', problemId: 'P2', relation: 'TRANSFER', owner: 'orthopedics', y: 210 },
    { actionType: 'TREATMENT', title: '继续肺部治疗', evidence: ['当前肺部结果支持继续治疗。'], action: '复核并继续执行肺部治疗方案。', rationale: '骨科诊疗推进的同时，肺部问题仍独立处于活动状态。', parents: [3], y: 0 },
    { actionType: 'PROCEDURE', title: '复核骨科操作', evidence: ['演示数据记录了骨科的操作前评估。', '所需准备工作已复核。'], action: '提出拟行的骨折相关操作供医生审核。', rationale: '当前骨科主管团队依据可得信息评估该干预。', problemId: 'P2', parents: [6], y: 210 },
    { actionType: 'REASSESS', title: '重新评估骨折路径', evidence: ['合成的操作已完成。', '当前恢复情况已可用。'], action: '复核恢复情况与后续骨科需求。', rationale: '重新评估为后续整合提供当前分支信息。', problemId: 'P2', y: 210 },
    { actionType: 'REASSESS', title: '回归当前主线管理', evidence: ['肺部治疗进展与骨科复评结果都已可用。'], action: '在肺部管理下新建一个整合性的重新评估。', rationale: '整合把两条当前路径合并，但不撤销骨科对骨折问题的主管权。', relation: 'RETURN', parents: [9, 7] },
    { actionType: 'DISCHARGE_FOLLOWUP', title: '协调两条随访计划', evidence: ['两个团队都指出仍需持续复查。'], action: '协调随访安排，明确两个问题各自的责任团队。', rationale: '整合之后仍要让每个问题的主管关系保持清晰。' },
  ],
});

const dynamic = buildCase({
  caseId: 'ZY030000642578', title: '一次就诊，两条并行路径', shortTitle: '神经 + 乳腺',
  description: '神经系统表现中发现了偶发的乳腺问题。两个并行问题分别获得意见与主管团队，最后向前整合。',
  pattern: '多问题动态管理', primaryProblem: '神经系统表现', owner: 'neurology',
  steps: [
    ...initial('头晕等神经系统相关问题'),
    { actionType: 'REASSESS', title: '新建偶发病灶路径', evidence: ['新获得的影像描述了一处偶发的乳腺异常。', '神经系统表现仍在评估中。'], action: '在当前诊疗过程下新建一个独立的乳腺问题。', rationale: '新问题需要自己的处理路径，同时原有表现仍在处理中。', problemId: 'P2', problemLabel: '偶发乳腺问题', parentProblemId: 'P1', relation: 'BRANCH', y: 210 },
    { actionType: 'TEST', title: '进一步明确乳腺病灶', evidence: ['该偶发发现尚未充分明确。'], action: '提出针对性的乳腺评估方案供医生审核。', rationale: '用针对性评估减少新问题中的不确定性。', problemId: 'P2', y: 210 },
    { actionType: 'CONSULT', title: '请乳腺外科会诊', evidence: ['针对性评估结果现已可用。'], action: '请乳腺外科提供意见，该问题暂时仍由神经内科主管。', rationale: '专科意见先于主管权转交，二者性质不同。', problemId: 'P2', relation: 'CONSULT', specialty: 'breast_surgery', y: 210 },
    { actionType: 'TRANSFER', title: '转交乳腺问题的主管权', evidence: ['专科复核认为乳腺问题需要持续管理。', '演示数据记录双方就责任归属达成一致。'], action: '把乳腺问题的主管权转交给乳腺外科团队。', rationale: '一次独立而明确的转交，记录下现在由谁负责该问题。', problemId: 'P2', relation: 'TRANSFER', owner: 'breast_surgery', y: 210 },
    { actionType: 'TEST', title: '继续神经系统评估', evidence: ['原有的神经系统问题仍需评估。'], action: '复核尚待完成的针对性神经系统检查。', rationale: '新出现的偶发问题不会取消原有的处理路径。', parents: [3], y: 0 },
    { actionType: 'TREATMENT', title: '更新神经系统方案', evidence: ['当前神经系统评估结果已可用。'], action: '提出更新后的神经系统管理方案供医生审核。', rationale: '原问题依据自身的当前证据与主管关系继续推进。', y: 0 },
    { actionType: 'PROCEDURE', title: '推进组织学评估', evidence: ['乳腺团队已复核当前病灶情况。', '演示数据记录操作前置条件已核对。'], action: '提出乳腺相关操作供医生审核。', rationale: '当前专科主管团队依据可得结果考虑操作评估。', problemId: 'P2', parents: [7], y: 210 },
    { actionType: 'PATHOLOGY', title: '解读乳腺病理', evidence: ['合成的操作已完成。', '标本报告为新释放的信息。'], action: '在乳腺管理背景下解读病理结果。', rationale: '该报告只有在操作阶段释放之后才可使用。', problemId: 'P2', y: 210 },
    { actionType: 'REASSESS', title: '整合当前诊疗方案', evidence: ['最新的神经系统方案与乳腺病理复核结果都已可用。'], action: '新建一次整合两条管理路径的重新评估。', rationale: '一个向前的双父节点事件把分支进展带回主线，同时保留专科主管关系。', relation: 'RETURN', parents: [11, 9] },
    { actionType: 'DISCHARGE_FOLLOWUP', title: '协调长期诊疗', evidence: ['整合复核指出两条路径各自的随访责任。'], action: '记录神经系统与乳腺的协同随访安排。', rationale: '在两个稳定问题之间保持连续性，同时不混淆各自的主管关系。' },
  ],
});

const acute = buildCase({
  caseId: 'ZY010001090829', title: '急性升级处置后的向前回归', shortTitle: '泌尿 + 重症',
  description: '急性感染问题打断了泌尿系统诊疗。重症医学科的主管权与后续回归都被明确记录。',
  pattern: '暂停 → 升级 → 恢复', primaryProblem: '泌尿系统问题', owner: 'urology',
  steps: [
    ...initial('泌尿系统相关问题'),
    { actionType: 'TREATMENT', title: '开始已复核的泌尿系统方案', evidence: ['初步泌尿系统结果已复核。'], action: '提出初始的非手术管理方案供医生审核。', rationale: '依据当前已有信息开始管理。' },
    { actionType: 'REASSESS', title: '识别急性恶化', evidence: ['新的观察信息描述了急性感染问题并伴有病情恶化。', '原有泌尿系统问题尚未解决。'], action: '新建一个急性问题，并请医生立即重新评估。', rationale: '新出现的不稳定改变了当前的优先级，需要独立的管理路径。', problemId: 'P2', problemLabel: '急性感染问题', parentProblemId: 'P1', relation: 'BRANCH', y: 210, safety: '本合成情景中存在急性恶化，升级处置需要医生立即审核。' },
    { actionType: 'REASSESS', title: '暂停择期泌尿工作', evidence: ['急性问题分支处于活动状态。', '后续择期泌尿工作需等待病情稳定。'], action: '把原问题记录为暂停，优先处理急性问题。', rationale: '暂停可以保留这个尚未解决的问题及其主管团队，便于日后在当前状态下回归。', parents: [4], status: 'SUSPENDED', y: 0 },
    { actionType: 'TRANSFER', title: '升级至重症医学科', evidence: ['本演示中当前的病情恶化需要更高级别的诊疗。', '转入重症医学科已获复核。'], action: '把急性问题的主管权转交给重症医学科。', rationale: '明确记录更高级别的主管团队，同时被暂停的泌尿问题仍归泌尿外科。', problemId: 'P2', parents: [5], relation: 'TRANSFER', owner: 'critical_care', y: 210, safety: '急性分支仍不稳定，脚本中的下一步是升级处置，而非择期干预。' },
    { actionType: 'TEST', title: '评估急性期状态', evidence: ['模拟的转入已完成。', '当前重症监护观察信息已可用。'], action: '复核与急性问题相关的针对性检查。', rationale: '当前临床状态决定重症医学科即时评估的方向。', problemId: 'P2', y: 210 },
    { actionType: 'TREATMENT', title: '复核重症治疗方案', evidence: ['急性期评估已复核。'], action: '提出重症治疗方案供医生审核。', rationale: '在明确的主管团队下处理仍在活动的急性问题。', problemId: 'P2', y: 210 },
    { actionType: 'REASSESS', title: '评估病情是否稳定', evidence: ['新的演示观察信息提示病情趋于稳定。', '进入下一诊疗阶段的条件需要复核。'], action: '重新评估急性问题以及回归的时机。', rationale: '恢复此前暂停的问题之前，必须先做一次当前状态的重新评估。', problemId: 'P2', y: 210 },
    { actionType: 'REASSESS', title: '结束急性诊疗阶段', evidence: ['脚本中的急性期复核把本阶段记录为已解决。'], action: '在本合成情景中记录急性问题已解决。', rationale: '用明确的生命周期变更来记录解决，而不是从回归关系中推断。', problemId: 'P2', status: 'RESOLVED', y: 210 },
    { actionType: 'REASSESS', title: '恢复当前泌尿系统管理', evidence: ['演示数据中急性问题已解决。', '被暂停的泌尿系统问题仍未解决。'], action: '新建一次泌尿系统重新评估，合并急性与被暂停两条上下文。', rationale: '回归主线是通过一个新事件恢复上游问题，而不是跳回此前的泌尿系统状态。', relation: 'RETURN', parents: [11, 6] },
    { actionType: 'TEST', title: '复核操作前准备情况', evidence: ['新的泌尿系统重新评估结果已可用。', '拟行操作的准备情况仍需核对。'], action: '提出当前的术前评估方案供医生审核。', rationale: '基于稳定后的当前状态重新核对前置条件，而不是沿用恶化之前的情况。' },
    { actionType: 'PROCEDURE', title: '复核泌尿系统操作', evidence: ['演示数据记录当前准备与操作前复核均已完成。'], action: '提出拟行的泌尿系统操作供医生审核。', rationale: '只有在当前重新评估与前置条件复核之后，才在原问题上继续推进。' },
    { actionType: 'PATHOLOGY', title: '解读标本报告', evidence: ['合成的操作已完成。', '标本报告现已可用。'], action: '与泌尿外科团队一起复核新可用的病理结果。', rationale: '使用操作完成后释放的证据，而不让更早的决策依赖它。' },
    { actionType: 'TREATMENT', title: '更新后续治疗', evidence: ['标本结果与当前恢复情况均已复核。'], action: '提出更新后的泌尿系统治疗方案供医生审核。', rationale: '把后续方案与术后当前证据绑定。' },
    { actionType: 'DISCHARGE_FOLLOWUP', title: '规划后续泌尿系统诊疗', evidence: ['演示数据记录了已复核的后续诊疗计划。'], action: '记录随访责任与今后的复评需求。', rationale: '以明确的持续主管关系与随访安排结束本次诊疗过程。' },
  ],
});

export const DEMO_CASES: DemoCase[] = [linear, advisory, ownership, dynamic, acute];
export const defaultDemoCase = dynamic;
export const DEFAULT_DEMO_CASE_ID = dynamic.caseId;
