/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

/**
 * 内置默认使用文档（docs_link 未配置时展示）。
 * 管理员在「系统设置 → 文档地址」配置外部文档站后，导航将改为外链，本页不再展示。
 */

export const DEFAULT_DOCS_ZH = `# 使用文档

## 快速开始

1. 登录后进入**工作台**，在「API 密钥」页面创建一个密钥
2. 将密钥填入任意 OpenAI 兼容的客户端或 SDK，接口地址填写本平台地址
3. 在**模型市场**查看可用模型与实时价格

## 接口调用

平台提供 OpenAI 兼容接口，任何支持自定义接口地址的工具均可直接接入：

\`\`\`bash
curl -X POST "<平台地址>/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <你的密钥>" \\
  -d '{
    "model": "deepseek-v4-pro",
    "messages": [
      { "role": "user", "content": "你好" }
    ]
  }'
\`\`\`

同时支持 \`/v1/responses\`、\`/v1/embeddings\`、\`/v1/images/generations\` 等端点，
以及流式输出（\`"stream": true\`）。

## 智能路由

平台提供虚拟路由模型（如 \`auto-cheap\`）。请求路由模型名时，系统按配置的策略
自动选择候选集中**当前成本最低的可用模型**；候选模型故障时自动切换到次优模型。

\`\`\`json
{ "model": "auto-cheap", "messages": [ ... ] }
\`\`\`

实际使用的模型与费用在「使用日志」中逐条可查。

## 分时价格

部分模型在不同时段执行不同价格（按**北京时间**）。在模型市场打开模型详情，
「分时价格」表会列出各时段的输入/输出价格，并标注当前生效时段。
计费按**请求发起时刻**的价格结算。

## 计费说明

- **按量计费**：费用 = token 用量 × 模型单价（元 / 百万 tokens），输入与输出分别计价
- **按次计费**：每次调用收取固定价格（如图像生成类模型）
- 余额、充值与消费明细见**钱包**与**使用日志**

## 常见问题

**调用返回 401**：检查密钥是否正确、是否以 \`Bearer \` 前缀携带。

**提示模型无可用渠道**：该模型暂未开放或分组无权限，请联系管理员。

**想在不同客户端使用**：任何支持「自定义 OpenAI 接口地址」的应用都可接入，
接口地址填平台地址，密钥填你创建的 API 密钥。
`

export const DEFAULT_DOCS_EN = `# Documentation

## Quick Start

1. Sign in, open the **Console**, and create a key on the "API Keys" page
2. Use the key with any OpenAI-compatible client or SDK, pointing the base URL to this platform
3. Browse available models and live prices in the **Model Square**

## Making Requests

The platform exposes OpenAI-compatible endpoints:

\`\`\`bash
curl -X POST "<base-url>/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <your-key>" \\
  -d '{
    "model": "deepseek-v4-pro",
    "messages": [
      { "role": "user", "content": "Hello" }
    ]
  }'
\`\`\`

\`/v1/responses\`, \`/v1/embeddings\`, \`/v1/images/generations\` and streaming
(\`"stream": true\`) are also supported.

## Smart Routing

Virtual router models (e.g. \`auto-cheap\`) automatically pick the **cheapest
available model** from a configured candidate set, with automatic failover.
The actual model used and the cost are recorded in the usage logs.

## Timed Prices

Some models charge different prices in different time windows (**Beijing time,
UTC+8**). Open a model's detail page in the Model Square to see its schedule.
Billing uses the price at the moment the request starts.

## Billing

- **Pay per token**: cost = token usage × unit price (per 1M tokens), input and output priced separately
- **Pay per request**: a flat price per call (e.g. image generation)
- Check balance and detailed usage in **Wallet** and **Usage Logs**
`
