# Oracle Studio（云占）

Oracle Studio 是一款面向中文用户的在线排盘应用，现已实现八字与六爻排盘，并提供基于大语言模型的流式解读。应用使用 React Router 服务端渲染，运行于 Cloudflare Workers。

本项目提供的排盘与解读仅供传统文化研究和娱乐参考，不应作为医疗、法律、投资等专业决策的依据。

## 当前功能

- 八字排盘：根据姓名、性别和出生时间生成命盘，展示四柱、十神、藏干、纳音、神煞、大运与流年等信息。
- 六爻排盘：支持手动指定、随机起卦、在线摇卦和时间起卦，展示本卦、变卦、纳甲、六亲、六神与旬空，并可复制排盘结果。
- AI 解读：八字与六爻分别使用独立的模型配置；回答以 NDJSON 流式返回，支持多轮会话。八字解读还包含本地排盘工具调用。
- 历史记录：自动保存排盘结果及其 AI 会话，可恢复、重命名和删除。
- 界面设置：支持浅色、深色和跟随系统三种外观模式。
- 账户系统：邮箱注册、密码登录、验证码登录、邮箱验证、验证码找回密码与退出登录。身份数据由 Better Auth 管理并存储在 Cloudflare D1。
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

BETTER_AUTH_SECRET=replace_with_a_random_secret_of_at_least_32_characters
BETTER_AUTH_URL=http://localhost:5173
RESEND_API_KEY=your_resend_api_key
AUTH_EMAIL_FROM=noreply@your-verified-domain.com
```

`*_LLM_BASE` 应填写 API 根地址。应用会在地址末尾补充 `/chat/completions`；如果配置值已经以该路径结尾，则不会重复追加。六爻接口要求上游支持流式响应，八字接口还要求模型支持工具调用。

账户系统的配置与邮件联调见下方「账户系统配置」。首次使用账户功能前，先初始化本地 D1：

```bash
npm run db:migrate:local
```

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
| `npm run test:auth` | 在临时 D1 中测试账户流程及 Resend 发信和错误处理，拦截 HTTP 请求，不投递真实邮件 |
| `npm run test:auth:worker` | 构建后在临时 Workers 运行时验证账户页面、登录及 SSR 会话数据 |
| `npm run db:migrate:local` | 应用本地 D1 迁移 |
| `npm run db:migrate:remote` | 应用线上 D1 迁移，需先绑定真实数据库 |
| `npm run auth:schema -- /tmp/auth-schema.sql` | 从当前 Better Auth 配置生成完整建表 SQL，供迁移对照；不覆盖已存在文件 |
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
| `/settings` | 账户与外观设置 |
| `/account/login` | 邮箱密码 / 验证码登录 |
| `/account/register` | 邮箱注册 |
| `/account/verify-email` | 邮箱验证码验证 |
| `/account/forgot-password` | 验证码找回密码 |
| `/api/auth/*` | Better Auth 账户接口 |
| `/api/bazi/ai` | 八字 AI 解读接口，仅接受 `POST` |
| `/api/liuyao/ai` | 六爻 AI 解读接口，仅接受 `POST` |

## 数据与配置

排盘历史、AI 会话和外观偏好仍保存在当前浏览器的 `localStorage` 中。账户、会话和验证码存储在 D1。当前接入只包含身份认证，登录不会自动迁移或同步本地历史记录。

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

## 账户系统配置

账户入口位于桌面侧栏和设置页。实现使用 [Better Auth 邮箱验证码插件](https://better-auth.com/docs/plugins/email-otp)、原生 D1 适配器，以及 [Resend 邮件发送 API](https://resend.com/docs/api-reference/emails/send-email)。Worker 通过原生 `fetch` 调用 Resend。

### 1. D1 数据库

`wrangler.jsonc` 中已声明 `AUTH_DB`，数据库名称为 `oracle-studio-auth`，迁移位于 `migrations/`。本地开发执行 `npm run db:migrate:local` 即可。

首次部署前登录 Cloudflare，创建专用数据库：

```bash
npx wrangler login
npx wrangler d1 create oracle-studio-auth --binding AUTH_DB --update-config
```

确认 `wrangler.jsonc` 的 `AUTH_DB` 绑定已填入创建结果的 `database_id`，并保留 `migrations_dir: "migrations"`。如果数据库已存在，直接使用其 ID，不要重复创建。然后执行：

```bash
npm run db:migrate:remote
```

首个迁移由当前 Better Auth 配置生成，包含 `user`、`session`、`account`、`verification` 和 `rateLimit` 五张表及索引。`auth:schema` 生成的是完整建表 SQL，不能直接作为已有数据库的增量迁移；后续变更应对照生成结果新增迁移文件，不修改已应用的迁移。

### 2. 会话密钥和站点地址

| 配置 | 说明 |
| --- | --- |
| `BETTER_AUTH_SECRET` | 至少 32 字符的随机密钥；各环境独立生成，并保持稳定 |
| `BETTER_AUTH_URL` | 应用的完整源地址，例如 `https://app.example.com`；不含路径。只有 localhost 可用 HTTP |
| `RESEND_API_KEY` | Resend API Key，使用 Sending access 权限并限制到发信域名 |
| `AUTH_EMAIL_FROM` | 仅填写发信邮箱地址，例如 `noreply@example.com`；域名必须已在 Resend 验证，显示名称由应用设置为「云占」 |
| `AUTH_DB` | D1 数据库绑定 |

本地填写 `.dev.vars`，线上使用 Wrangler 交互式输入：

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put AUTH_EMAIL_FROM
```

真实密钥不可提交 Git。生产环境必须使用 HTTPS；登录 Cookie 为 HttpOnly、Secure、SameSite=Lax。登录后跳转仅允许站内页面。未完成配置时账户界面会显示暂不可用。

### 3. 验证码邮件

在 [Resend Domains](https://resend.com/domains) 添加发信域名，按控制台要求配置 DNS，等待验证通过。然后在 [Resend API Keys](https://resend.com/api-keys) 创建具备 [Sending access 权限](https://resend.com/docs/api-reference/api-keys/create-api-key)的密钥，限制到该域名，并分别填写 `RESEND_API_KEY` 和该域名下的 `AUTH_EMAIL_FROM`。

邮件同时包含中文纯文本和 HTML 内容。本地开发与生产环境都会调用 Resend 并使用其发送额度，验证码需要从收件箱查看。若尚未验证域名，可临时使用 `AUTH_EMAIL_FROM=onboarding@resend.dev` 测试，但收件人仅限 Resend 账户自身邮箱，详见 [Resend 测试域名限制](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)。自动化测试会拦截 HTTP 请求，不需要真实 Resend 密钥。

邮件任务由当前请求的 `ctx.waitUntil()` 执行，避免因发送耗时泄露账户是否存在。Resend 请求在 10 秒后超时；非成功 HTTP 状态和网络错误都会作为发送失败处理。发送失败记录通用服务端错误，响应不暴露邮箱是否已注册；需要检查服务端日志和 Resend 控制台的投递情况。应用日志不会记录密钥、验证码、邮件内容或 Resend 原始错误响应。

从原邮件服务切换到 Resend 只需补齐发信配置并部署，不涉及账户数据或 D1 表结构迁移。

### 行为与验证

- 注册后必须验证邮箱；验证成功自动登录。未注册邮箱不能通过验证码登录自动创建账户。
- 验证码为 6 位数字，有效期 5 分钟，最多允许 3 次错误尝试；重新发送后旧码失效，数据库保存验证码哈希。
- 密码长度为 8–128 字符，使用 Better Auth 默认密码哈希。
- 重置密码后旧密码及所有旧会话失效，需要重新登录；会话最长 7 天，每天刷新有效期。
- 认证限流存储在 D1，使用 Cloudflare 提供的客户端 IP；验证码相关接口默认每 IP、每接口每分钟最多 3 次。
- 当前账户系统不限制匿名排盘或 AI 解读，不包含历史同步、第三方登录、手机号或邮箱修改。

```bash
npm run test:auth
npm run typecheck
npm run build
```

测试在临时 D1 中检查真实 Better Auth 请求处理、迁移兼容性、验证码并发消费、密码和会话失效、限流与来源校验。邮件通过模拟 Resend HTTP 响应捕获，同时验证鉴权失败、限流、服务错误和网络超时的脱敏处理。测试不会发送真实邮件，也不会修改本地或线上业务数据库。

`npm run test:auth:worker` 会额外验证生产构建在 Workers 中的运行情况，包括注册后通过 Resend 发送验证码、完成邮箱验证、登录密码哈希、账户页面 SSR、Cookie 传递，以及页面数据不包含会话令牌。这个测试使用临时数据库，并拦截全部出站请求。

## 部署

首次部署前登录 Cloudflare：

```bash
npx wrangler login
```

线上环境必须配置 `wrangler.jsonc` 中声明的 LLM 配置和上文四项账户配置，并先完成 D1 迁移与 Resend 发信域名验证：

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
