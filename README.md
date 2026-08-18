# Oracle Studio（云占）

Oracle Studio 是一款面向中文用户的在线排盘应用，现已实现八字与六爻排盘，并提供基于大语言模型的流式解读。应用使用 React Router 服务端渲染，运行于 Cloudflare Workers。

本项目提供的排盘与解读仅供传统文化研究和娱乐参考，不应作为医疗、法律、投资等专业决策的依据。

## 当前功能

- 八字排盘：根据姓名、性别和出生时间生成命盘，展示四柱、十神、藏干、纳音、神煞、大运与流年等信息。
- 六爻排盘：支持手动指定、随机起卦、在线摇卦和时间起卦，展示本卦、变卦、纳甲、六亲、六神与旬空，并可复制排盘结果。
- AI 解读：八字与六爻分别使用独立的模型配置；回答以 NDJSON 流式返回，支持多轮会话。八字解读还包含本地排盘工具调用。
- 历史记录：自动保存排盘结果及其 AI 会话，可恢复、重命名和删除。
- 界面设置：支持浅色、深色和跟随系统三种外观模式。
- 响应式界面：针对桌面端和移动端提供不同的导航与交互布局。

首页同时保留塔罗牌、梅花易数、奇门遁甲、紫微斗数和星盘入口，目前这些方式尚未开放。

## 技术栈

- React 19、React Router 8（Framework Mode、SSR）
- TypeScript 7、Vite 8
- Cloudflare Workers、Cloudflare Vite Plugin、Wrangler 4
- Tailwind CSS 4
- shadcn/ui（`base-luma` 预设、Base UI）
- `taibu-core`、`iching-shifa`、`tyme4ts`
- Streamdown、Motion、Lucide React

具体依赖版本以 [`package.json`](./package.json) 和 [`package-lock.json`](./package-lock.json) 为准。

## 环境要求

- Node.js 22.22.0 或更高版本
- npm
- 部署时需要可用的 Cloudflare 账户
- 启用 AI 解读时需要一个兼容 OpenAI Chat Completions 接口的模型服务

## 本地开发

安装依赖：

```bash
npm ci
```

创建本地环境变量文件：

```bash
cp .dev.vars.example .dev.vars
```

填写 `.dev.vars`：

```dotenv
liuyao_LLM_MODEL=your_model_name
liuyao_LLM_BASE=https://api.example.com/v1
liuyao_LLM_KEY=your_api_key

bazi_LLM_MODEL=your_model_name
bazi_LLM_BASE=https://api.example.com/v1
bazi_LLM_KEY=your_api_key
```

`*_LLM_BASE` 应填写 API 根地址。应用会在地址末尾补充 `/chat/completions`；如果配置值已经以该路径结尾，则不会重复追加。六爻接口要求上游支持流式响应，八字接口还要求模型支持工具调用。

启动开发服务器：

```bash
npm run dev
```

默认访问地址为 `http://localhost:5173`。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动带热更新的开发服务器 |
| `npm run typecheck` | 生成 Cloudflare 与 React Router 类型并执行 TypeScript 检查 |
| `npm run build` | 创建生产构建 |
| `npm run preview` | 构建并在本地预览生产版本 |
| `npm run cf-typegen` | 仅重新生成 Cloudflare Worker 类型 |
| `npm run deploy` | 构建并部署到 Cloudflare Workers |

提交代码前至少应运行：

```bash
npm run typecheck
npm run build
```

## 路由

| 路径 | 用途 |
| --- | --- |
| `/` | 方式选择与今日宜忌 |
| `/bazi` | 八字排盘 |
| `/liuyao` | 六爻排盘 |
| `/history` | 历史记录管理 |
| `/settings` | 外观设置 |
| `/api/bazi/ai` | 八字 AI 解读接口，仅接受 `POST` |
| `/api/liuyao/ai` | 六爻 AI 解读接口，仅接受 `POST` |

## 数据与配置

排盘历史、AI 会话和外观偏好保存在当前浏览器的 `localStorage` 中。项目没有配置服务端数据库，因此清除浏览器站点数据或更换浏览器后，历史记录不会自动恢复或同步。

LLM 密钥不会写入客户端代码。浏览器只请求本项目的 `/api/*/ai` 路由，由 Cloudflare Worker 读取环境配置并向上游模型服务发起请求。`.dev.vars` 已被 Git 忽略，不应提交真实密钥。

环境变量分为八字和六爻两组：

| 变量 | 用途 |
| --- | --- |
| `bazi_LLM_KEY` | 八字解读服务的 API 密钥 |
| `bazi_LLM_BASE` | 八字解读服务的 API 根地址 |
| `bazi_LLM_MODEL` | 八字解读使用的模型标识 |
| `liuyao_LLM_KEY` | 六爻解读服务的 API 密钥 |
| `liuyao_LLM_BASE` | 六爻解读服务的 API 根地址 |
| `liuyao_LLM_MODEL` | 六爻解读使用的模型标识 |

## 部署

首次部署前登录 Cloudflare：

```bash
npx wrangler login
```

线上环境必须配置 `wrangler.jsonc` 中声明的六项必需配置：

```bash
npx wrangler secret put liuyao_LLM_MODEL
npx wrangler secret put liuyao_LLM_BASE
npx wrangler secret put liuyao_LLM_KEY
npx wrangler secret put bazi_LLM_MODEL
npx wrangler secret put bazi_LLM_BASE
npx wrangler secret put bazi_LLM_KEY
```

构建并直接部署到生产环境：

```bash
npm run deploy
```

如需先创建可预览但不立即接管生产流量的版本：

```bash
npm run build
npx wrangler versions upload
```

验证后可通过交互式命令选择版本并设置流量比例：

```bash
npx wrangler versions deploy
```

Worker 名称、兼容日期、Node.js 兼容标志、可观察性和源码映射上传等部署设置位于 [`wrangler.jsonc`](./wrangler.jsonc)。

## 目录结构

```text
app/
├── components/       业务组件与 shadcn/ui 组件
├── features/         AI、八字、六爻及历史记录领域逻辑
├── lib/              通用工具与 Cloudflare 上下文
├── routes/           页面路由与服务端 API 路由
├── app.css           Tailwind CSS 与主题变量
├── root.tsx          根布局、导航与主题入口
└── routes.ts         路由声明
public/               图标、Web App Manifest 等静态资源
workers/app.ts        Cloudflare Worker 入口
react-router.config.ts
vite.config.ts
wrangler.jsonc
```

`app/components/ui/` 中的文件由 shadcn CLI 管理。业务层的样式调整应通过组合、包装组件或调用处的类名完成，不直接修改这些基础组件。
