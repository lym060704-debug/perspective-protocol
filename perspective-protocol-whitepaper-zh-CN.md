# 去中心化 AI 视角协议（简体中文版）
## Decentralised AI Perspective Protocol — 技术白皮书（草稿 v0.1）

**日期**：2026-11-22
**状态**：组内讨论稿。所有参数为待校准的占位值；合约接口与架构为示意，未经审计。

---

> 说明：本文件由 OpenCC 从繁体版自动转换，并做了少量术语校正；原始版本为 `perspective-protocol-whitepaper.md`。正式提交前请再人工校对术语与引用格式。

## 摘要

中心化 AI 服务把模型权重、对齐策略与数据分布收束成单一声音。用户容易在第一个答案上锚定，并在后续交互中遭遇 AI 迎合（sycophancy），逐渐失去比较视角的能力。本文提出「去中心化 AI 视角协议」：用户收到初步回答后，可发出「获取第二意见」请求；智能合约将查询路由到一组可验证地相互独立、且模型血缘与运营者皆去重的 AI 节点，并以多声部（multi-voice）方式呈现结果，而不是汇总成另一个单一答案。

协议的核心不变式是**盲态独立（blind independence）**：节点在被指派任务时尚未见过第一个答案，且必须先以哈希承诺自己的回答（commit-reveal），全员承诺完成后才能揭露。这使「迎合锚点」在时间上不可能发生——相同结论只可能来自独立收敛，分歧则必然是真正的异见。在此基础上，本文给出三项主要设计：

1. 以**预训练血缘（lineage）与运营者（operator）为轴的分层抽样**，使「多样性」成为协议可验证的性质，而非营销用语；
2. **一致性红利与分歧红利并存的双轨激励**，处理「奖励独立」与「奖励噪音」之间的张力；
3. 一组可计量的**评估方法**，其中「sycophancy delta」用以直接量化锚定偏差的因果影响。

本文亦明确定义协议能保证什么、不能保证什么：它保证的是**程序独立性**，而非事实正确性；其经济安全在网络规模小时是脆弱的。

**关键词**：AI 迎合、多声部推理、commit-reveal、模型血缘、去中心化验证、机制设计

---

## 0. 本稿的立场

一句话：本协议保证的是**程序的独立性**，不是答案的正确性。任何把它宣传成「去中心化就比较真」的说法，都超出了设计能承担的范围。

这个立场贯穿全文，也决定了第九节的评估方法。协议能证明的是「这五个答案在产生时彼此不可见，且来自五条不同的模型血缘」；它不能证明「其中任何一个是对的」。事实层面的正确性仍要靠佐证、审计与外部证据，并明确标注其不确定性。

---

## 1. 动机与问题陈述

### 1.1 单一算法对信息的收束

当多数用户通过同一个模型取得答案时，该模型的权重、对齐策略与数据分布便成为事实上的信息中间人。这不是阴谋，而是集中化的结构后果：

- 后训练（RLHF／偏好优化）本身会压缩输出的多样性，把「多种合理观点」收敛为一种被偏好的语气与立场；
- 使用率集中形成反馈回路：越多人用，越多反馈用于微调同一个模型，单一视角越稳固；
- 用户端只看到一个合成后的答案，看不到生成过程中的分歧、不确定性与替代解释。

### 1.2 两种迎合

本文区分两种 sycophancy：

- **S1，对用户的迎合**：模型倾向同意用户的立场、调整答案以取悦对方。这是文献中最常讨论的形态（Sharma et al., 2023）。
- **S2，对锚点与多数的迎合**：模型在先看到既有答案、他人意见或多数结论后，倾向与之趋同。这正是「多模型并列」在缺乏独立性保证时会失效的原因——五个模型若都能看到第一个答案，得到的是五次回声，不是五个视角。

本协议的结构性设计主要针对 S2（以盲态承诺从时间上消除它），并以任务模板中的 premise-challenge 槽位部分处理 S1。

**操作性定义**：对锚点 $a$ 与节点输出 $y$，定义主张层一致度 $A(y,a)$。在非盲条件下测得的 $A$ 与盲态下的 $A$ 之差，即为锚定效应的因果估计（见第九节）。

### 1.3 现有做法为何不足

| 做法 | 不足 |
|---|---|
| 单一供应商内的多模型／router | 同源血缘、同套对齐策略，多样性是表面的；且都可见彼此输出 |
| 多 agent debate 研究（Du et al., 2023；Liang et al., 2023） | 多为实验室方法，无结算层、无诱因、无可验证性、无独立性保证 |
| 去中心化推理／算力市场 | 多样性以「节点数」计，不以「视角数」计；同源模型可无限复制 |
| 加一个「反方观点」提示词 | 仍在单一模型与单一配置内，且用户无法验证提示是否真的被运行 |

### 1.4 设计目标

- **G1 独立性**：节点在不见锚点与彼此答案的条件下作答，且此条件可被验证。
- **G2 可验证多样性**：多样性以模型血缘与运营者实体计量，并由协议强制下限。
- **G3 可验证推理**：能证明某个权重哈希确实在受认证的环境中产生了该输出。
- **G4 隐私**：查询默认不以明文暴露给节点运营者。
- **G5 可接受的成本与延迟**：以渐进式揭露与可选节点数平衡体验。
- **G6 激励兼容**：诚实、独立地作答是节点的支配策略（在既定假设下）。
- **G7 抗审查**：任何合规节点都可注册与被抽中，选择过程使用可验证随机数。

---

## 2. 相关工作与差异化

- **AI safety via debate**（Irving et al., 2018）：以对抗式辩论逼近真值的理论框架。本协议不假设存在可裁定的真值，而是把分歧本身作为产品。
- **Multi-agent debate**（Du et al., 2023；Liang et al., 2023）：多模型交互可提升事实性与推理，但节点间可见彼此输出，无法区分「独立收敛」与「相互传染」。
- **Sycophancy 实证研究**（Perez et al., 2022；Sharma et al., 2023）：提供评测与行为证据，但缺乏部署层面的结构性干预。
- **预言机网络与 VRF**（如 Chainlink）：提供可验证的随机选择与结算模式，本协议沿用其工程惯例。
- **可验证推论**：TEE（NVIDIA H100 Confidential Computing、Intel TDX）、zkML、乐观验证与欺诈证明，构成成本与信任假设的光谱。
- **多样性抽样**：determinantal point process（Kulesza & Taskar, 2012）用于在集合层面最大化覆盖率。

**差异化**：(1) 以 commit-reveal 提供链上可验证的独立性保证；(2) 血缘感知的分层抽样，使多样性可稽核；(3) 可计量的迎合指标与盲／非盲对照实验设计。

---

## 3. 系统概览

### 3.1 角色

| 角色 | 职责 |
|---|---|
| 用户／客户端 | 发起「第二意见」请求，选择节点数、预算与隐私模式；接收多声部结果 |
| 首答服务商（host） | 产生第一个答案；在路由前签署并提交 `anchorHash` |
| AI 节点 | 提供推理；提交承诺与揭露；附上模型与硬件证明 |
| 结算合约 | 托管付款、抽样、承诺—揭露时序、挑战与结算 |
| 注册表（registry） | 维护 Perspective Card：模型血缘、运营者实体、证明、价格 |
| 审计者 | 随机重运行、提出欺诈证明，赚取赏金 |
| 聚合器 | 产生主张层分析与 crux 地图；本身亦受多样性与可验证性约束 |
| 治理 | 维护血缘分类、参数与升级；受时间锁与挑战程序约束 |

### 3.2 分层

```
[Client / Host App]
   │  QueryEnvelope（含 anchorHash、anchorSignature）
   ▼
[Market Contract] ──VRF──▶ [Registry: Perspective Cards]
   │  分层抽样、锁定押金
   ▼
[AI Nodes：不同血缘 × 不同运营者]
   │  commit ──▶ reveal（盲态）
   ▼
[Verification Layer：TEE 证明｜随机重运行｜欺诈证明]
   │
   ▼
[Presentation Layer：多声部 ＋ crux 地图]
   ▲
[Registry / Reputation / Dispute] ◀── [Settlement]
```

### 3.3 信任模型

- 节点与运营者可能理性自利、可能合谋、可能作恶。
- 不假设多数节点诚实；安全来自结构（盲态、抽样、押金）与可验证性。
- TEE 是一项**明示的信任假设**：信任分散到硬件厂商与其供应链，而非消失。
- 治理的多签与升级权是残余的中心化风险，需以时间锁、可挑战的参数变更与最小权限设计降低。

---

## 4. 协议规格

### 4.1 查询信封 QueryEnvelope

| 字段 | 说明 |
|---|---|
| `requestId` | 合约产生 |
| `queryCiphertext` | 查询负载；加密到节点 enclave 密钥（默认） |
| `anchorHash` | 第一个答案的哈希；路由前由 host 签署，防止事后替换锚点 |
| `anchorSignature` | host 对 `anchorHash` 的签名 |
| `params.n` | 节点数（建议 3–7） |
| `params.diversityFloor` | 最低血缘数与运营者数 |
| `params.queryType` | `factual`／`mixed`／`evaluative`，影响奖励权重 |
| `params.postCommitCritique` | 是否在揭露后开放「知情异议」（见 4.4） |
| `budget` | 托管金额 |
| `commitDeadline`／`revealDeadline` | 时序 |
| `privacyMode` | `tee_envelope`／`redacted`／`threshold`（后者为未来选项） |

### 4.2 Perspective Card（节点视角卡）

节点注册时提交，并可被挑战：

- `modelHash`：权重文件哈希；须与 TEE 内量测到的哈希一致；
- `lineageId`：预训练血缘（基础模型与主要衍生谱系）；
- `operatorEntity`：运营者实体识别（身分绑定或押金加权的实体凭证）；
- `attestation`：硬件与运行环境证明；
- `capabilities`／`domains`：可处理的领域与语言；
- `price`、`capacity`、`region`。

**原则**：抽样单位是「视角卡」，不是「节点」。同一运营者在五台机器上跑同一个血缘模型，仍然只算一个视角。

### 4.3 请求状态机

```
OPEN ──(选定 n 个节点、押金锁定)──▶ COMMITTING
COMMITTING ──(commitDeadline)──▶ REVEALING
REVEALING ──(revealDeadline)──▶ VERIFYING
VERIFYING ──(证明通过／抽样审计完成)──▶ SETTLEABLE
SETTLEABLE ──(challengeWindow 到期)──▶ SETTLED
任一阶段 ──(有效挑战)──▶ DISPUTED ──(裁决)──▶ SLASHED / SETTLED
```

关键时序规则：**揭露只能在所有承诺完成或承诺期截止后开始**，任何提前揭露皆视为违规。

### 4.4 盲态承诺与两阶段作答

**第一阶段（盲态主答案）**

```
commit_i = keccak256(answer_i ‖ salt_i ‖ nodeId ‖ requestId)
```

- 节点在承诺期内只提交哈希，内容不可见；
- 承诺期结束后统一进入揭露期；
- 揭露内容与承诺不符、或未揭露者，押金按比例罚没。

由于哈希不可逆，节点无法从他人的承诺推得答案；由于揭露统一开始，任何节点都无法在看到他人答案后调整自己的主答案。**这使 S2 迎合在结构上不可发生**，也让「多数意见」在生成阶段不存在。

**第二阶段（可选：知情异议）**

在揭露完成后，节点可选择看到第一个答案，并额外提交一段「分歧说明」：指出它与锚点在哪些主张上不同、理由是什么。

- 此阶段的输出**不计入分歧红利**，避免节点把主要精力放在事后批评；
- 它只用于呈现层的 crux 分析与用户理解；
- 标注为 `post_commit`，与主答案分开显示，不得混入主答案的评分。

这个两阶段设计解决了一个真实张力：用户希望节点「针对第一个答案」给出意见，但独立性要求节点在作答时看不到它。先盲答、后知情评论，两者兼得。

### 4.5 分层抽样

输入：合格视角卡集合 $C$、节点数 $n$、VRF 种子 $s$。

```
buckets ← group_by(C, c ↦ (c.lineageId, c.operatorEntity))
keys    ← deterministic_shuffle(s, keys(buckets))
sel     ← ∅
for k in keys:
    if |sel| < n:
        sel ← sel ∪ { weighted_random(s, buckets[k]) }   # 每桶至多 1
if |sel| < n:
    sel ← fill_by_coverage(sel, C, n, s)   # 以 DPP 最大化视角距离
    mark(sel, "insufficient_diversity")
return sel
```

规则：

1. **血缘约束**：每个 (lineage × operator) 桶至多抽 1 个；
2. **可验证随机**：VRF 种子公开可验证，运营者无法挑题或磨节点集；
3. **失败可见（fail-visible）**：若合格血缘数不足以满足 `diversityFloor`，协议**不得**默默以重复血缘补位，必须在结果中标记「多样性不足」，并按比例退还部分费用；
4. 抽样计算在链下完成、链上验证（或由 VRF 种子确定性推导），以控制 gas；
5. **首答排除**：若 host 本身也是节点运营者，其节点不得被选入该请求，避免「自己佐证自己」。

### 4.6 付款与结算

- 请求时全额托管；
- 按节点计价：基础费 + 审计后红利 − 罚没（见第六节）；
- 若有效揭露数少于 `n`，按比例退款并记录相关节点声誉；
- 挑战期内任何持有证据者均可提出挑战，需附押金。

### 4.7 呈现规范（协议层要求，非 UI 事后补丁）

| 编号 | 规则 |
|---|---|
| R1 | 不得把任何单一综合答案作为主要输出；若提供摘要，必须标明它是「某节点的观点」，并显示分歧比例 |
| R2 | 显示顺序随机化；不得按质押量、价格或声誉排序 |
| R3 | 每个视角标注血缘、运营者、证明状态、信心与理由 |
| R4 | 提供 crux 视图：抽取原子主张、聚类立场、指出分歧最大且各有支持的主张对 |
| R5 | 提供「只看最强反对意见」模式 |
| R6 | 显示本次的多样性报告：有效血缘数、有效运营者数、主张层离散度 |

聚合器可以是客户端程序，也可以是独立的去中心化角色；若采用后者，聚合器本身也应以 n-of-m 多样性与可验证抽取方式运作，避免把中心化从推理层转移到聚合层。

### 4.8 隐私

- 默认：查询以节点 TEE 公钥加密，明文仅存在于受认证的 enclave 内；
- 可选：用户端先做敏感信息遮罩，UI 显示遮罩了什么；
- 未来：门槛加密或 FHE，使单一节点无法取得完整明文；
- 中继数据最小化：不必要的查询时间、来源信息不落链。

---

## 5. 可验证的多样性

### 5.1 模型真实性

`modelHash` 必须在 TEE 内量测并附证明，防止节点宣称使用了某模型却实际调用另一个。血缘分类由治理维护，接受公开挑战：任何人都可提交「此模型为某基础模型之衍生」的证据，经审核后更新 `lineageId`。

### 5.2 多样性的操作化定义

- **血缘有效数** $L_{eff} = \exp(-\sum_l p_l \ln p_l)$，$p_l$ 为血缘 $l$ 在本次样本中的占比；
- **运营者有效数** $O_{eff}$ 同理；
- **主张层离散度**：对 `evaluative` 类型查询，计算揭露答案两两之间的立场距离平均。

三者合称 **D-report**，随每次请求公开显示。

### 5.3 多样性下限与失败可见

协议以合约层约束 `minLineages` 与 `minOperators`。当网络规模不足时，系统的行为是**清楚标示低多样性并部分退款**，而不是用同源节点凑数。这是一条产品与伦理上的硬规则：与其假装多样，不如承认不足。

### 5.4 已知限制

血缘判定仍有灰色地带：大量微调、合并（merge）与蒸馏模型使得「同源」与「不同源」不是二元命题。治理需公布分类方法与挑战记录；这一限制无法靠程序完全消除。

---

## 6. 激励机制

### 6.1 支付结构

对节点 $i$：

$$
P_i = B + \alpha A_i + \beta V_i \mathbb{1}[\text{justified}] - \gamma R_i - S_i
$$

- $B$：基础费（涵盖推理成本）；
- $A_i$：经审计的事实准确度——只计可被佐证的事实主张；
- $V_i$：有限上限的非冗余分，只作用于 `evaluative` 维度，且需要附理由与可查证主张；
- $R_i$：冗余惩罚（与其他节点高度重复时扣分）；
- $S_i$：罚没。

**按查询类型调权**：`factual` 查询 $\beta \approx 0$（事实问题上收敛是好事）；`evaluative` 查询 $\alpha$ 只作用于可验证的子主张，$\beta > 0$ 但设上限。若不区分，协议就会同时奖励「正确的事实」与「刻意的反常」，这是设计上最常见的失败模式。

### 6.2 攻击与反制

| 攻击 | 机制 | 残余风险 |
|---|---|---|
| 羊群／迎合锚点 | 盲态承诺；生成阶段不存在多数 | 模型自身对用户立场的迎合（S1）仍需任务模板与评测处理 |
| 为红利而反主流 | 分歧红利设上限；须附理由；事实偏离不给分 | 「理由质量」难以自动判定 |
| 抄袭他人答案 | commit-reveal 使抄袭在时序上不可能 | 链下先合谋可绕过，见下 |
| 合谋环（先链下合谋再提交） | VRF 随机抽样；(lineage × operator) 去重；跨查询答案相关性图分析；随机审计 | 小规模网络下难以统计辨识 |
| 承诺后不揭露（饿死配额） | 押金罚没、退款、声誉扣分 | 可针对特定请求阻挠，需以 n+k 超额指派缓解 |
| 伪造模型宣称 | TEE 量测哈希 + 硬件证明 | 硬件与供应链信任 |
| 磨随机性挑节点 | VRF 种子不可预测、不可操控 | 无 |
| 反复提交垃圾查询 | 费用与押金；速率限制 | 成本导向 |

### 6.3 声誉

- 领域特定（数学、医疗以外之一般知识、程序等分开计分）；
- 随时间衰减，不可转让；
- 用户信号（如「这个视角让我改变了判断」）仅作弱信号，且需防刷分；
- 「sycophancy 漂移」作为声誉的负向指标：同一查询多次投放，节点向多数或锚点收敛的速度越快，分数越低。

### 6.4 启动期的诚实设计

网络小时，经济安全是假象：三个运营者即可合谋。启动阶段应以**白名单保证血缘多样性**、以人工与社群审计补位，并在文档与 UI 中明说「目前多样性有限」。不要用代币激励假装去中心化已经成立。

---

## 7. 验证与审计

| 层级 | 手段 | 成本 | 信任假设 | 适用 |
|---|---|---|---|---|
| L1 | TEE 远程证明（H100 CC／TDX） | 中 | 硬件厂商与供应链 | 主路径 |
| L2 | 乐观验证：随机重运行 + 欺诈证明 | 低 | 至少一名诚实审计者 | 抽查与争议 |
| L3 | zkML | 高 | 密码学假设 | 小型验证器（如主张抽取器） |

**可验证的事**：某权重哈希在受认证环境中产生该输出、输出未被篡改、commit-reveal 时序正确、抽样符合规则。

**不可验证的事**：事实正确性、推理质量、观点是否「有价值」。这些靠佐证、横向比较与用户判断。

**经济参数**：令作弊期望获益为 $G$、审计抽样率为 $\rho$、欺诈证明成功率为 $q$，则押金 $B_s$ 应满足 $B_s > G / (\rho q)$，并随节点规模动态调整。

---

## 8. 威胁模型

| # | 威胁 | 缓解 | 残余风险 |
|---|---|---|---|
| T1 | Sybil 节点 | 实体绑定、注册成本、每运营者上限 | 实体辨识本身不完美 |
| T2 | 模型单一化／假多样性 | 血缘注册、分层抽样、失败可见 | 血缘判定灰色地带 |
| T3 | 合谋 | 盲态、VRF、相关性分析、审计 | 小网络 |
| T4 | 抄袭锚点 | 盲态承诺 | 无（对诚实节点而言） |
| T5 | 反主流套利 | 红利上限、理由要求、事实偏离扣分 | 理由质量难判 |
| T6 | TEE 侧信道／供应链攻击 | 多厂商、乐观审计、关键路径 zkML | 硬件信任 |
| T7 | 隐私外泄 | enclave 加密、遮罩、最小化中继数据 | enclave 内明文 |
| T8 | 审查与选择性排除 | 超额指派、退款、声誉、公开抽样记录 | 针对性排除仍可能 |
| T9 | UI 锚定偏差 | 顺序随机化、分歧优先、禁止单一主答案 | 视觉显著性仍影响判断，需用户研究 |
| T10 | 锚点替换 | host 签名 + 路由前上链 | host 与请求者可能为同一实体 |
| T11 | 合约漏洞／治理捕获 | 审计、时间锁、最小权限、可挑战参数 | 治理攻击面 |
| T12 | 提示注入／越狱（查询本身含恶意指令） | 模板隔离、输出检查、跨节点主张比对 | 开放式任务无法完全防范 |

---

## 9. 评估方法

### 9.1 核心指标：sycophancy delta

在受控基准中，故意提供一个**错误锚点** $a$，比较同一模型在两种条件下的表现：

$$
\mathrm{SD}(m) = \mathbb{E}\left[A(y_m^{\text{non-blind}}, a)\right] - \mathbb{E}\left[A(y_m^{\text{blind}}, a)\right]
$$

- 协议本身在结构上使盲态 $\mathrm{SD} = 0$（看不见锚点，无从迎合）；
- 真正要报告的是各血缘的**纠正率** $CR = \Pr(\text{节点不同意错误锚点} \mid \text{blind})$，以及跨模型的分歧结构；
- 非盲对照组用于估计「若没有协议，锚定会造成多少偏差」，这正是协议可作为**测量仪器**的价值。

### 9.2 其他指标

| 指标 | 定义 | 方向 |
|---|---|---|
| 主张层分歧率 | 每次请求中，立场不同之原子主张占比 | 视查询类型而定 |
| 有效血缘数／运营者数 | $L_{eff}$、$O_{eff}$ | 越高越好 |
| 延迟 | p50／p95 从请求到首个视角、到全部视角 | 越低越好 |
| 成本 | 每次请求的总费用 | 越低越好 |
| 合谋侦测 | 仿真合谋环下的 precision／recall | 越高越好 |
| 用户校准 | 决策后的信心变化与 Brier 分数 | 越准越好 |

### 9.3 实验设计

- **对照组**：B1 单一中心化模型；B2 同模型采样 5 次；B3 同供应商五模型并列；B4 本协议（血缘去重）。
- **条件**：盲／非盲（仅用于测量，非协议模式）。
- **仿真攻击**：注入合谋环、反主流套利者、抄袭者，测试侦测与罚没。
- **用户研究**：设计锚定任务（例如数值估计与事实判断），测量用户是否因多声部而修正判断、是否过度折扣所有信息。重点是**校准**，不是「让用户更常改变主意」。

---

## 10. 路线图

### Phase 0：可展示的原型

- L2 结算、registry、commit-reveal、3–5 条真正不同的血缘、客户端聚合；
- 暂不激活 TEE，以白名单节点与信任假设公开声明取而代之；
- 交付：可操作的 demo ＋ sycophancy-delta 基准报告；
- 退场条件：完成 50 次以上请求、基准可重现、无致命流程漏洞。

### Phase 1：经济安全

- 质押、罚没、随机审计抽样、公开 registry、呈现规范 v1；
- 交付：合谋与套利仿真报告、对抗演练记录；
- 退场条件：在既定攻击模型下，作弊期望收益为负。

### Phase 2：可验证与隐私

- TEE 认证、乐观欺诈证明、门槛加密、去中心化聚合器、治理机制；
- 交付：外部审计报告、参数治理手册。

---

## 11. 限制与开放问题

1. **程序独立 ≠ 知识独立**：不同血缘仍可能共享相似的网络语料与对齐方法，分歧可能比预期小。这需要实测，不能宣称。
2. **血缘分类的治理风险**：分类者拥有实质权力，需公开方法、可挑战、可申诉。
3. **TEE 不是去中心化**：它把信任转移到硬件厂商。
4. **小网络经济学**：规模不足时，合谋成本低于防御成本，只能靠白名单与人工审计。
5. **聚合层可能重新中心化**：若由单一聚合器做摘要，等于把单一声音请回来；需以协议规则与多样性约束防范。
6. **S1（对用户的迎合）未被结构性解决**：premise-challenge 只是部分缓解，仍需模型层与评测层的工作。
7. **对「观点质量」缺乏客观裁判**：本协议只能呈现分歧与证据，不能裁定哪个价值判断更好。
8. **法律与责任**：多节点内容的责任归属、管辖与下架机制，尚未设计。
9. **节点可自行查询同一个首答服务商**：协议只保证「协议没有揭露锚点」，无法阻止节点在链下绕道取得同源答案。这会侵蚀独立性，只能以血缘多样性、行为相关性分析与用户可见的多样性报告降低影响，不能宣称消除。

**待决事项**：分歧红利上限与一致性红利的比例（需机制仿真）；主张抽取与 crux 算法的可验证化；跨链与区域节点的延迟权衡；是否引入查询类型之第三方裁定。

---

## 12. 结论

本协议的贡献不在于「多问几个模型」，而在于把独立性变成可验证的程序性质：先承诺、后揭露，让迎合在时间上不可能；以血缘与运营者去重，让多样性可稽核；以双轨激励，让独立与诚实同时有利可图；以盲／非盲对照，让 sycophancy 可以被计量，而不只是被谴责。

它的边界同样清楚：它保证程序，不保证真理；它降低结构性偏差，不消除模型自身的偏见；它在网络规模小时，经济安全是脆弱的。把这些边界写进产品与论文，比宣称「去中心化 AI 更客观」更有说服力。

---

## 附录 A：合约接口（示意）

```solidity
interface IPerspectiveMarket {
    enum RequestState { OPEN, COMMITTING, REVEALING, VERIFYING, SETTLEABLE, SETTLED, DISPUTED }

    struct Request {
        address requester;
        bytes32 anchorHash;
        bytes32 anchorSignature;
        bytes32 selectionSeed;   // VRF 输出
        uint8   n;
        uint96  budget;
        uint64  commitDeadline;
        uint64  revealDeadline;
        uint64  challengeDeadline;
        RequestState state;
    }

    function request(
        bytes32 anchorHash,
        bytes32 anchorSignature,
        uint8 n,
        uint96 budget,
        uint64 commitWindow,
        uint64 revealWindow
    ) external payable returns (bytes32 requestId);

    function commit(bytes32 requestId, bytes32 answerCommitment) external;
    function reveal(bytes32 requestId, bytes calldata answer, bytes32 salt) external;
    function attest(bytes32 requestId, address node, bytes calldata teeQuote) external;
    function challenge(bytes32 requestId, address node, bytes calldata evidence) external payable;
    function settle(bytes32 requestId) external;
    function slash(address node, bytes32 reason, bytes calldata proof) external;
}
```

> 注：血缘分桶与覆盖率计算建议于链下运行，链上仅验证 VRF 种子推导出的确定性结果或提交之证明，以控制 gas。

## 附录 B：QueryEnvelope 范例

```json
{
  "requestId": "0x…",
  "queryCiphertext": "0x…",
  "anchorHash": "0x…",
  "anchorSignature": "0x…",
  "params": {
    "n": 5,
    "diversityFloor": { "minLineages": 4, "minOperators": 4 },
    "queryType": "evaluative",
    "presentation": "multi_voice_crux",
    "postCommitCritique": true
  },
  "budget": "0.05 ETH",
  "commitDeadline": "2026-11-22T12:00:00Z",
  "revealDeadline": "2026-11-22T12:02:00Z",
  "privacyMode": "tee_envelope"
}
```

## 参考文献（初稿，需依投稿格式补齐）

1. Irving, G., Christiano, P., & Amodei, D. (2018). *AI Safety via Debate.* arXiv:1805.00899.
2. Du, Y., Li, S., Torralba, A., Tenenbaum, J. B., & Mordatch, I. (2023). *Improving Factuality and Reasoning in Language Models through Multiagent Debate.* arXiv:2305.14325.
3. Liang, T., et al. (2023). *Encouraging Divergent Thinking in Large Language Models through Multi-Agent Debate.* arXiv:2305.19118.
4. Sharma, M., et al. (2023). *Towards Understanding Sycophancy in Language Models.* Anthropic. arXiv:2310.13548.
5. Perez, E., et al. (2022). *Discovering Language Model Behaviors with Model-Written Evaluations.* arXiv:2212.09251.
6. Kulesza, A., & Taskar, B. (2012). *Determinantal Point Processes for Machine Learning.* Foundations and Trends in Machine Learning.
7. NVIDIA (2023). *Confidential Computing on NVIDIA H100 Tensor Core GPUs.*
8. Intel. *Intel Trust Domain Extensions (TDX) Documentation.*
9. Chainlink. *Verifiable Random Function (VRF) Documentation.*
