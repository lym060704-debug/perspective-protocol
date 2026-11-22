# 互动原型：去中心化 AI 视角协议

这个原型有两种体验：

1. **预设示例**（事实型 / 评价型）：罐头数据，离线可用，适合快速演示协议。
2. **自定义问题**：输入你自己的问题，通过本地代理调用真实模型；也可以用模拟模式完整跑通界面。

> 概念原型，不是生产系统。真实模式会调用你配置的模型 API，费用由你的账号承担。
>
> **前置**：需要 Bun（用 `bun --version` 检查）。

## 当前配置：DeepSeek V4.1 Flash + V4 Pro（2 条血缘）

`config.json` 已经按 DeepSeek 配好：

- 首答与分析：`deepseek-flash`（DeepSeek-V4.1-Flash）
- 视角节点池：10 个节点，分属两条血缘
  - `L1` DeepSeek-Flash：n1–n5，5 个运营者，模型 `deepseek-flash`
  - `L2` DeepSeek-V4-Pro：n6–n10，5 个运营者，模型 `deepseek-v4-pro`
- 两个模型共用 `https://api.deepseek.com` 和同一个 key（`DEEPSEEK_API_KEY`，放在本地 `.env`）
- 已通过 `extraBody` 关闭 V4 Pro 的 thinking，避免思考 token 占满输出预算；代价是 V4 Pro 的推理深度会下降

**当前限制**：只有 2 条血缘，而协议每次要抽 5 个节点。界面会如实标注「低多样性 · 2 条血缘」；同一血缘的多个节点是同一模型的重复采样，只能算部分独立。要成为真正的多视角网络，需要至少 3–5 个不同模型家族的 key。

`config.json` 里的 `allowSameLineage: true` 是低多样性回退开关：

- 打开时：5 个节点在 2 条血缘之间分配（当前行为），界面标注低多样性。
- 删掉或设为 `false`：严格每条血缘只取 1 个节点；以当前配置会只选 2 个节点，并显示「血缘不足」。

## 运行

### 推荐：双击 `start.cmd`

Windows 下直接双击 `start.cmd`：它会检查 Bun、启动本地代理，并自动打开 `http://127.0.0.1:8787`。保持那个黑色命令行窗口开着，关闭窗口就会停止服务。

自定义模式**必须**打开 `http://127.0.0.1:8787`，不能双击 `index.html`（`file://` 页面连不上本地代理）。

### A. 只看预设示例（不需要 key）

双击 `index.html`。自定义页会提示未连接本地代理，预设示例正常。

### B. 自定义问题 + 模拟模式（不需要 key）

```bash
cd prototype
MOCK_LLM=1 bun server.js
```

打开 `http://127.0.0.1:8787`，切到「自定义」。界面会标注「模拟模式」。如果 `config.json` 存在，模拟模式会使用其中的节点池，所以你会看到当前的「2 条血缘」低多样性提示。

Windows PowerShell：

```powershell
$env:MOCK_LLM="1"; bun server.js
```

### C. 自定义问题 + 真实 DeepSeek

1. 在本地 `.env` 中填入 DeepSeek key：

```text
DEEPSEEK_API_KEY=...
```

本机已经写入过 `.env`（该文件被 `.gitignore` 忽略，不会提交）。换机器或换 key 时重新填。**不要把 key 发到聊天、issue 或仓库里。**

2. 启动：

```bash
cd prototype
bun server.js
```

3. 打开 `http://127.0.0.1:8787`，切到「自定义」，输入问题 → 生成首答 → 获取第二意见。

说明：这套页面是独立原型，**不会自动读取 Cherry Studio 里的 DeepSeek key**。请在 DeepSeek 控制台申请 key，或从 Cherry Studio 的 DeepSeek provider 设置里复制到本地 `.env`。

## 让别人的电脑打开

### 1. 同一个 Wi-Fi / 局域网（最简单）

先关闭已经占用 8787 端口的本地服务，然后二选一：

- **只展示界面，不消耗 API 额度**：双击 `share-demo.cmd`。它以 `MOCK_LLM=1`、`HOST=0.0.0.0` 启动，所有回答都会标注为模拟；把服务器窗口打印的地址（例如 `http://192.168.1.10:8787`）发给同一网络的人即可。
- **使用真实 DeepSeek 模型**：双击 `share-live.cmd`，阅读警告并输入 `YES`。它使用本机 `.env` 里的 key。**同网络的任何人都能提问并消耗你的额度**，而且没有登录、限流或审计。只建议在可信网络使用单独的、有限额的 key，演示完立即关闭。

Windows 防火墙第一次弹窗时允许「专用网络」。如果对方打不开：确认两台电脑在同一 Wi-Fi / 网段；确认没有开客户端隔离；检查 Windows 防火墙是否允许 Bun 的入站连接。

> 不要把 8787 端口直接映射到公网。当前原型没有身份验证、限流和访问控制。

### 2. 不同网络 / 外网

- **只展示预设示例**：把 `index.html`、`styles.css`、`app.js` 和两份白皮书放到任意静态网站（GitHub Pages、Netlify 等）。罐头示例可以离线看；自定义模式会提示未连接本地代理。
- **需要真实模型**：推荐部署到一台有 HTTPS 的服务器，并在前面加登录 / 访问码和限流，key 只放在服务端环境变量里；不要把自己的家用电脑和 `.env` 直接暴露到公网。
- **临时隧道**（Cloudflare Tunnel、ngrok、Tailscale 等）可以做演示，但如果对公网开放的是 live 代理，任何人都能消耗你的 API 额度；没有访问控制时，只应把 **mock 模式**通过隧道分享。

### 3. 把整个项目发给别人

打包时排除 `.env`，保留 `config.json`（不含 key）、`config.example.json` 和 `.env.example`。对方需要：

1. 安装 Bun；
2. 双击 `start.cmd`（自己的电脑本地使用）；
3. 想在自定义页调用真实模型，就在自己的 `.env` 填自己的 key；
4. 只想看界面，可双击 `index.html` 看预设示例，或运行 `MOCK_LLM=1 bun server.js`。

**不要分享 `.env`**；它包含你的真实 key。也可以把 `.env` 删除后发送整个文件夹。

## 如何变成真正的多血缘

当前 `config.json` 有 2 条 DeepSeek 血缘（Flash + V4 Pro），仍不是完整的多视角网络。要得到 3–5 条真正独立的血缘：

1. 准备其他模型家族的 key，例如 OpenRouter（一把 key 可访问多家模型）、Moonshot、Qwen；或在本地运行 Ollama / LM Studio。
2. 在 `config.json` 的 `defaults` 或每个节点上设置 `baseUrl` 与 `apiKeyEnv`。
3. 给不同模型家族分配不同的 `lineageId`（如 L1、L2、L3、L4、L5），每个 lineage 至少一个节点。
4. 建议 host / analyst 使用与节点不同的模型；至少不要让 host 和某个节点完全相同。
5. 把 `allowSameLineage` 设为 `false`，让协议严格执行「每条血缘只取一个节点」。

本机检测结果（截至本次配置）：Ollama（`127.0.0.1:11434`）和 LM Studio（`127.0.0.1:1234`）当时都没有运行，Cherry Studio 里也只有 DeepSeek 配了 key。所以目前只能到 2 条血缘。`config.example.json` 是一个 5 血缘的多模型模板，可以作为起点；**当前 `config.json` 没有被它覆盖。**

## 配置字段

```json
{
  "allowSameLineage": true,
  "defaults": {
    "baseUrl": "https://api.deepseek.com",
    "apiKeyEnv": "DEEPSEEK_API_KEY",
    "temperature": 0.7,
    "maxTokens": 1000,
    "timeoutMs": 60000,
    "extraBody": { "thinking": { "type": "disabled" } }
  },
  "host": { "label": "DeepSeek-V4.1-Flash", "model": "deepseek-flash" },
  "analyst": { "label": "DeepSeek Analyst", "model": "deepseek-flash" },
  "nodes": [
    { "id": "n1", "lineageId": "L1", "lineage": "DeepSeek-Flash", "operatorId": "opA", "operator": "Op-A", "model": "deepseek-flash" },
    { "id": "n6", "lineageId": "L2", "lineage": "DeepSeek-V4-Pro", "operatorId": "opA", "operator": "Op-A", "model": "deepseek-v4-pro" }
  ]
}
```

- `defaults`：默认 `baseUrl`、key 环境变量名、`temperature`、`maxTokens`、`timeoutMs`、额外 headers / body。
- `extraBody`：合并进每个 Chat Completions 请求体。当前用 `{"thinking":{"type":"disabled"}}` 关掉 DeepSeek 的思考模式；如果你想保留 V4 Pro 的 thinking，删掉这一项，并把 `maxTokens` 调到 1500 以上。
- `host`：首答模型。
- `analyst`：汇总共识 / 分歧的模型；缺省时使用 host。
- `nodes`：视角节点。每个节点必须有 `id`、`lineageId`、`lineage`、`operatorId`、`operator`、`model`。
- 每个节点可覆盖 `baseUrl`、`apiKeyEnv`、`model`、`system`、`temperature`。本地 Ollama / LM Studio 可以去掉 `apiKeyEnv`（服务器会不发送 Authorization）。
- 抽选规则：先按血缘每类取一个节点；运营者尽量不重复；最多 5 个节点。只有 `allowSameLineage: true` 时，才允许从已选血缘补足节点，并标注低多样性。
- **当前原型不会验证模型身份**：血缘和运营者标签来自你的 config。生产版需要 TEE / 权重哈希等证明，否则「多血缘」只是配置声明。

## 自定义模式的流程

1. 输入问题，点「生成首答」。首答由 host 模型（当前是 DeepSeek V4.1 Flash）生成。
2. 点「获取第二意见」。本地代理按血缘抽选节点，并行调用。
3. 盲态模式下，节点的 prompt **不会包含首答**；代理先返回承诺哈希，客户端再请求揭露。
4. 分析模型汇总共识和关键分歧。
5. 想换问题，点「换一个问题」；编辑问题会让旧首答失效，需要重新生成。
6. 打开「对照模式」，节点会在 prompt 中看到首答，用来观察锚定造成的收敛。真实模式不会自动计算 Sycophancy delta，需要分别跑盲态与非盲态再比较。

## 承诺、顺序与低多样性提示

- **加盐承诺（自定义模式）**：每个成功回答用 16 字节随机 salt，承诺为 `SHA-256(answer + NUL + salt + NUL + nodeId + NUL + runId)`。`/api/perspectives` 只返回承诺；`/api/reveal` 才返回答案与 salt。浏览器用 Web Crypto 重算并标注「承诺校验通过 / 失败」。这比单纯哈希答案更接近白皮书的承诺闭环；链上版本仍应改为 keccak256 并上链。
- **展示顺序随机化**：揭露后的视角卡片会重新随机排序，并在选择摘要和结果徽章标注「顺序已随机化」，避免第一张卡片被读成「最佳答案」。
- **低多样性前置**：自定义页在提问前就会显示节点池的血缘数；若少于 5 条，会提前说明本轮属于低多样性，而不是跑完才提示。
- **抽选可复现（部分）**：`/api/perspectives` 返回本次 `seed`；可用 `GET /api/select?seed=...` 复现节点集。当前是本地伪随机抽样，不是链上 VRF；完整验证仍需公开的 VRF 证明和验证脚本。
- **模式标签**：预设示例统一标为「罐头演示 / 示例」，自定义模式按 `/api/health` 的 `mock` / `configured` 标为「模拟」或「真实」，避免把示例数据读成真实模型结果。

## 边界与安全

- **真实的是模型回答**：节点确实调用了你配置的模型。当前实测 `deepseek-flash` 首答 + `deepseek-flash` / `deepseek-v4-pro` 混合的 5 个节点 + 分析都正常；V4 Pro 在 thinking 关闭时有正常输出。
- **自定义模式已有加盐承诺闭环**：服务器生成 salt 和 SHA-256 承诺，揭露时浏览器重算校验；但这仍是本地进程内的时序，不是链上证明。预设示例的哈希是非加密占位，只用于展示流程。
- **模拟的是协议时序**：本地代理强制「盲态 prompt + 延迟揭露」，但上链、VRF、TEE 与罚没仍是原型模拟。
- 没有真实 TEE；界面上的「真实」只表示真的调用了模型，不表示有硬件证明。
- 没有质押、罚没、退款、审计；没有用户研究。
- 每个自定义问题通常产生 1 次首答 + 最多 5 次节点调用 + 1 次分析调用。节点调用并行；当前超时 60 秒。V4 Pro 通常比 Flash 慢。
- 分析模型也可能有偏差；它只做汇总，不代替你自己判断。
- 问题与回答会发送给 DeepSeek；不要输入敏感数据。
- API key 只在本地服务进程里读取；浏览器只拿到模型元数据和回答，不会拿到 key。
- 分享项目文件夹时不要带上 `.env`，它包含本地 key；如果 key 曾出现在聊天、日志或截图中，请到 DeepSeek 控制台轮换。

## Mock 测试

`MOCK_LLM=1 bun server.js` 不会调用任何真实模型。Mock 的节点回答都带「（模拟）」前缀，界面显示「模拟模式」，不能用于测量或对外宣称是真模型结果。

## 文件

```text
prototype/
├── index.html              # 页面结构：预设示例 + 自定义问题
├── styles.css              # 视觉样式与移动端适配
├── app.js                  # 前端：抽样、commit-reveal 展示、渲染
├── server.js               # 本地代理：静态服务 + OpenAI 兼容 API 调用
├── start.cmd               # Windows 一键本地启动
├── share-demo.cmd          # 局域网分享：mock 模式，不调用真实模型
├── share-live.cmd          # 局域网分享：真实模型，需确认并注意 API 额度
├── config.json             # 当前 DeepSeek 双血缘配置（本地，gitignored）
├── .env                    # 本地 DeepSeek key（gitignored，不要分享）
├── config.example.json     # 5 血缘多模型模板
├── .env.example            # key 模板
├── .gitignore
└── README.md
```

说明文档：`../perspective-protocol-whitepaper-zh-CN.md`（简体版由繁体版自动转换并做了术语校正，正式提交前仍需人工校对）；原始繁体版为 `../perspective-protocol-whitepaper.md`。

## 对应白皮书

| 原型元素 | 白皮书 |
|---|---|
| 查询信封与 requestId | 4.1 |
| 节点池与 Perspective Card 概念 | 4.2 |
| 承诺 → 揭露 → 呈现的步骤 | 4.3、4.4 |
| 血缘 × 运营者分层抽样、首答排除 | 4.5 |
| 共识区、crux、多样性报告 | 4.7、5.2 |
| 盲 / 非盲一致度与 delta | 9.1 |
| 排除、去重、失败可见的设计 | 5.3、8 |

## 常见问题

- **「未连接本地代理」/ 问不了问题**：先双击 `start.cmd`（或运行 `bun server.js`），然后打开 `http://127.0.0.1:8787`。不要用 `file://` 打开页面进自定义模式。服务窗口被关掉、电脑重启后，需要重新启动。
- **「模型未配置」**：检查 `.env` 里的 `DEEPSEEK_API_KEY`，以及 `config.json` 是否还有 `REPLACE_*`。改完后重启服务并刷新页面。
- **提示「低多样性 · 2 条血缘」**：当前只有 DeepSeek Flash 和 V4 Pro 两个模型版本。这是如实标注，不是 bug。要真正多视角，请加其他模型家族的 key，或参考 `config.example.json`。
- **只出现 2 个节点**：删掉了 `allowSameLineage` 或设为 `false`，严格执行单血缘单节点。补足其他 lineage，或重新打开该开关。
- **回答全是「模拟」**：当前是 `MOCK_LLM=1` 模式，或者没有配置真实 key。
- **自定义模式没有 Sycophancy delta**：真实模式需要分别跑盲态和非盲态，才能比较同一组节点的一致性；当前版本不会自动做 A/B。
- **8787 端口被占用**：用 `PORT=8790 bun server.js` 启动，然后打开 `http://127.0.0.1:8790`。

## 术语表

- **血缘（lineage）**：模型家族 / 权重来源的抽象层级。同一血缘的节点不算独立视角。
- **运营者（operator）**：运行节点的实体；同一运营者的多个节点也不能当作独立证据。
- **commit-reveal**：先提交答案哈希作为承诺，等所有节点提交完再揭露答案和盐。
- **TEE**：可信执行环境；原型只显示占位标签，没有真实硬件证明。
- **VRF**：可验证随机函数；原型用本地种子模拟抽选，尚未上链。
- **Sycophancy delta**：同一组节点在非盲与盲态下「与首答一致度」的差值；当前只有罐头示意值和手动 A/B 建议，没有自动测量。

## 本轮针对评审的修复

- 预设示例明确标为「罐头演示 / 示例」，不再用「TEE」标签暗示真实证明。
- 自定义模式的血缘数、节点数、运营者数由 `/api/health` 与 `/api/nodes` 驱动；低多样性在提问前提示。
- 自定义模式实现 16 字节 salt 的 SHA-256 承诺，并在揭露后由浏览器重算校验。
- 结果展示顺序随机化；标签页支持 ← / → / Home / End 键盘导航。
- 补齐 favicon、繁体白皮书链接、信心值缺失兜底。
- 仍未完成：真正的 5 条跨家族血缘（缺少其他 provider key）、自动盲/非盲 A/B、主张级离散度、链上 VRF/TEE。

## 下一步建议

1. 为真正的多血缘补上 3–5 个不同模型家族的 key，或在 OpenRouter 上选五个不同家族。
2. 把 `server.js` 里的节点抽选与承诺时序换成 Solidity 合约 + VRF，并把承诺哈希换成 keccak256。
3. 为节点增加真实的 TEE / 权重哈希证明，让「血缘」可验证。
4. 为自定义问题实现自动的盲 / 非盲 A/B，计算 Sycophancy delta。
5. 用真实模型跑一轮小规模用户研究。
