# 去中心化 AI 视角协议（DAPP）

一个「盲态、多模型第二意见」的概念原型与技术白皮书。

第一个 AI 答案出现后，用户点击「获取第二意见」；协议把同一问题路由给多个不同血缘的模型节点，让它们在看不到首答的条件下独立作答，再揭露、比较共识与关键分歧。

**边界：这个项目保证程序独立，不保证答案正确；也不是「去中心化就更客观」的证明。**

## 在线演示

- GitHub Pages：<https://lym060704-debug.github.io/perspective-protocol/>
- 互动原型：`prototype/`
- 技术白皮书：[简体版](perspective-protocol-whitepaper-zh-CN.md) · [原始繁体版](perspective-protocol-whitepaper.md)

> GitHub Pages 只托管静态文件。事实型 / 评价型预设示例可以完整运行；自定义问题需要本地 Bun 代理和模型 key，所以线上会显示「未连接本地代理」。

## 目录

```text
.
├── index.html                                  # GitHub Pages 入口，跳转到原型
├── prototype/                                  # 互动原型
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── server.js                               # 本地代理（不在 GitHub Pages 运行）
│   ├── config.example.json
│   └── README.md                               # 运行、分享与配置说明
├── perspective-protocol-whitepaper-zh-CN.md
└── perspective-protocol-whitepaper.md
```

## 本地运行

需要 [Bun](https://bun.sh)。

```bash
cd prototype
bun server.js
```

Windows 可以直接双击 `prototype/start.cmd`，然后打开 <http://127.0.0.1:8787>。预设示例不需要 key；自定义问题需要在本地 `.env` 中配置模型 key，详见 `prototype/README.md`。

## 安全

- `.env` 和 `config.json` 已被 `.gitignore` 忽略，不会进入仓库。
- 不要把 API key 提交到 GitHub、粘贴到 issue，或打包进分享压缩包。
- 本地代理只应由你自己在可信网络运行；它没有登录、限流和审计。
