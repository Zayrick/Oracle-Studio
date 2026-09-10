# Oracle Studio（云占）

Oracle Studio 是一款面向中文用户的在线排盘应用，现已实现八字与六爻排盘，并提供基于大语言模型的流式解读。应用使用 React Router 服务端渲染，运行于 Cloudflare Workers。

本项目提供的排盘与解读仅供传统文化研究和娱乐参考，不应作为医疗、法律、投资等专业决策的依据。

## 当前功能

- 八字排盘：根据姓名、性别和出生时间生成命盘，展示四柱、十神、藏干、纳音、神煞、大运与流年等信息。
- 六爻排盘：支持手动指定、随机起卦、在线摇卦和时间起卦，展示本卦、变卦、纳甲、六亲、六神与旬空，并可复制排盘结果。
- AI 解读：登录后使用账户专属 OpenRouter Key，八字与六爻分别引用独立 Preset；回答以 NDJSON 流式返回，支持多轮会话。八字解读还包含本地排盘工具调用。
- 历史记录：保存原始排盘输入及 AI 会话，打开时在浏览器重新排盘；支持恢复、重命名、删除及账户云同步。
- 界面设置：支持浅色、深色和跟随系统三种外观模式。
- 账户系统：邮箱注册、注册邮箱验证、密码登录、验证码找回密码与退出登录。身份数据由 Better Auth 管理并存储在 Cloudflare D1。
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
- 完成注册及启用 AI 解读需要 OpenRouter Workspace、Management API Key，以及八字和六爻的 Presets

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
OPENROUTER_MANAGEMENT_KEY=your_openrouter_management_key
OPENROUTER_WORKSPACE_ID=your_workspace_uuid
AI_KEY_ENCRYPTION_SECRET=base64_encoded_random_32_bytes
OPENROUTER_BAZI_PRESET=bazi
OPENROUTER_LIUYAO_PRESET=liuyao

BETTER_AUTH_SECRET=replace_with_a_random_secret_of_at_least_32_characters
BETTER_AUTH_URL=http://localhost:5173
RESEND_API_KEY=your_resend_api_key
AUTH_EMAIL_FROM=noreply@your-verified-domain.com
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

AI 请求固定发送至 OpenRouter，不再读取原有的 `*_LLM_KEY`、`*_LLM_BASE` 和 `*_LLM_MODEL`。先在目标 Workspace 创建 `bazi`、`liuyao` 两个 Preset，配置支持流式响应的模型；八字模型还需支持工具调用。

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
| `npm run test:auth:worker` | 构建后在临时 Workers 运行时验证注册绑定、用户 Key 推理、账户页面及 SSR 会话数据 |
| `npm run test:ai` | 在临时 D1 中测试用户 Key 隔离、旧账户补绑、Preset 路由、工具循环、错误脱敏和流式取消 |
| `npm run test:history` | 在临时 D1 中验证旧记录迁移、云同步、账户隔离、离线重试及跨时区重算 |
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
| `/account/login` | 邮箱密码登录 |
| `/account/register` | 两步注册：验证邮箱后设置密码 |
| `/account/forgot-password` | 验证码找回密码 |
| `/api/auth/*` | Better Auth 账户接口 |
| `/api/history` | 登录后的历史与外观设置同步：`GET` 分页读取、`POST` 提交修改 |
| `/api/bazi/ai` | 八字 AI 解读接口，仅接受 `POST` |
| `/api/liuyao/ai` | 六爻 AI 解读接口，仅接受 `POST` |
| `/api/ai/usage` | 查询本账户回复的累计用量，并补查缺失费用，仅接受 `POST` |

## 数据与配置

排盘历史、AI 会话和外观偏好随账户存储在 D1 的 `user_data` 表中。登录（包括刷新后恢复登录状态）会自动迁移本机旧记录并下载云端数据；新增、重命名、删除、AI 会话更新和外观选择都会自动同步。未登录时仍可在本机保存，之后登录自动导入。

业务记录使用 `schemaVersion: 2`，只保存 `raw` 输入和 AI 会话。六爻的 `yaoValues` 为自下而上的六个爻值（6 老阴、7 少阳、8 少阴、9 老阳）；八字保存姓名、性别和出生时间。卦名、宫位和命盘等计算结果不再持久化，每次打开由客户端重算。记录创建、更新、删除、AI 会话及排盘时间均使用整数 **Unix 秒**；排盘时间同时保存 `utcOffsetMinutes`（UTC 以东的分钟数），保持不同设备的排盘历法输入一致。旧版日期没有时区信息，首次转换时采用迁移设备在对应日期的时区偏移。Better Auth 自身的身份认证表日期由其适配器管理。

浏览器的 `oracle-studio.data.v3:*` 仅承担按账户隔离的缓存和待同步队列。退出登录后不会展示前一账户的数据，也不会将其待同步记录导入其他账户。`oracle-studio.history.v2` 按条迁移，只有云端确认后才清除对应旧数据；无法转换的记录会保留并提示。外观首次导入时优先采用账户已有的云端设置；`oracle-studio-theme` 保留为首屏主题缓存。

同步失败会保留待同步操作，自动退避重试，并在恢复网络、回到页面或点击「重试同步」时继续。在线页面每分钟检查云端变化。同步通过版本标识处理同一秒内的连续编辑；多个设备并发修改同一条历史时保留「同步副本」，删除标记防止旧设备恢复已删除数据。接口校验登录账户、请求来源、数据结构和请求大小，并分批上传、分页下载。

上线此版本前，先对现有 D1 执行 `npm run db:migrate:remote`，应用所有新增迁移（包括 `0002_user_data.sql`、`0003_user_ai_credentials.sql` 和 `0004_ai_usage.sql`），再发布应用。本地可用 `npm run db:migrate:local`；已有 `0001_auth.sql` 无需重建或修改。

## OpenRouter 账户绑定与 AI 调用

浏览器只请求本应用的 `/api/bazi/ai` 和 `/api/liuyao/ai`。Worker 校验登录会话、邮箱验证状态、同源请求及 `X-Account-Id`，从 D1 读取该用户的 Key，再调用 OpenRouter。每次推理由服务端填写 `user`，并以 `用户 ID:会话 ID` 作为 `session_id`；客户端不能选择其他用户的 Key 或覆盖 Preset。八字工具调用的全部轮次复用相同用户 Key。

| 配置 | 用途 |
| --- | --- |
| `OPENROUTER_MANAGEMENT_KEY` | OpenRouter Management API Key，只用于创建和回收用户 Key，不用于推理 |
| `OPENROUTER_WORKSPACE_ID` | 创建用户 Key 的目标 Workspace UUID |
| `AI_KEY_ENCRYPTION_SECRET` | 32 字节随机密钥的 Base64 编码，用于 AES-256-GCM 加密用户 Key；独立于会话密钥 |
| `OPENROUTER_BAZI_PRESET` | 八字 Preset slug，默认 `bazi`，调用时转换为 `@preset/bazi` |
| `OPENROUTER_LIUYAO_PRESET` | 六爻 Preset slug，默认 `liuyao`，调用时转换为 `@preset/liuyao` |

前三项通过 Worker secrets 配置；两个 Preset slug 在 `wrangler.jsonc` 的 `vars` 中配置，本地也可通过 `.dev.vars` 覆盖。`.dev.vars` 已被 Git 忽略，不应提交真实密钥。用户 Key 不写入 Worker 环境变量，也不会出现在页面、会话响应或浏览器缓存中。加密内容与用户 ID、Workspace ID 绑定，复制数据库密文到另一个账户无法解密。

注册最后一步先取得 D1 的短期占用标识，随后**等待** OpenRouter 创建 Key；用户、密码、加密 Key 和验证码凭证消费在同一个 D1 事务内提交，成功后才创建登录会话。OpenRouter 失败时不创建用户，保留未过期的注册凭证供重试。D1 提交失败时尝试撤销尚未绑定的远端 Key，并释放占用标识。并发提交不会重复创建正常绑定，占用标识在 Worker 意外退出后可过期重试；注册期间重新发验证码也不会替换正在提交的凭证。

已有账户在下一次成功的密码登录时补绑，然后才签发新会话。已有绑定的登录不会创建新 Key。AI 请求本身始终只读绑定；升级前已经登录但尚未绑定的账户，会收到重新登录提示。

OpenRouter 与 D1 之间没有跨服务原子事务。若创建 Key 的响应丢失或 Worker 在保存前终止，远端仍可能留下未绑定 Key；应用不对创建请求做盲目自动重试。Key 名称使用 `oracle-studio/user/<userId>` 便于核对。回收失败记录 `ai_key_cleanup_failed`，提交结果不确定记录 `ai_key_commit_uncertain`，均仅包含行政标识、不包含密钥或提示词；可在 OpenRouter 对照 D1 绑定记录清理。不要直接更换 `AI_KEY_ENCRYPTION_SECRET` 或 Workspace：现有密文需先迁移或重新绑定，不能靠更换配置自动恢复。

所有用户 Key 仍由所属 OpenRouter 账户统一付费。模型选择、供应商路由和备用模型在 Preset 中调整；请求中显式传递的排盘上下文和工具参数按 OpenRouter 的规则覆盖或合并 Preset 对应字段。

接口与配置依据：[Management API Keys](https://openrouter.ai/docs/guides/overview/auth/management-api-keys)、[创建 Key](https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key)、[Presets](https://openrouter.ai/docs/guides/features/presets)、[Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。

### 用量与费用

每条 AI 回答底部依次显示金额和 Token 数量，数据返回前预留一行空白。展示金额在前端按 credits × 7 换算，向上取整到两位小数，格式为 `¥xx.xx`。八字 Agent 的模型轮次逐次累计，工具调用结束后更新用量。完整的输入、输出、推理、缓存和调用次数可通过该行的提示查看。

`0004_ai_usage.sql` 新增四张表：

| 表 | 内容 |
| --- | --- |
| `ai_usage_turns` | 回复与账户、历史记录、会话、消息的关联 |
| `ai_model_calls` | 每次模型请求、实际模型与供应商、generation ID、用量和费用 |
| `ai_tool_calls` | 每次工具调用的参数、结果与执行状态 |
| `ai_usage_observations` | 原始用量响应、费用补查结果和时间 |

原始费用以 credits 的十进制字符串存储和累计。历史消息保存回复 ID 与用量快照，对应明细保存在上述表中。

输出结束或中断后，服务端通过 OpenRouter `/generation` 补查缺失费用。查询失败显示“无法获取费用”，保留已知金额；重新打开会话时通过 `POST /api/ai/usage` 再次查询。该接口按登录账户、占卜类型和会话读取数据。

接口依据：[Usage Accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting)、[Generation metadata](https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation)。

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

首个迁移由当前 Better Auth 配置生成，包含 `user`、`session`、`account`、`verification`、`pendingRegistration` 和 `rateLimit` 六张表及索引。`auth:schema` 生成的是完整建表 SQL，不能直接作为已有数据库的增量迁移；后续变更应对照生成结果新增迁移文件，不修改已应用的迁移。

### 2. 会话密钥和站点地址

| 配置 | 说明 |
| --- | --- |
| `BETTER_AUTH_SECRET` | 至少 32 字符的随机密钥；各环境独立生成，并保持稳定 |
| `BETTER_AUTH_URL` | 应用的完整源地址，例如 `https://app.example.com`；不含路径。只有 localhost 可用 HTTP |
| `RESEND_API_KEY` | Resend API Key，使用 Sending access 权限并限制到发信域名 |
| `AUTH_EMAIL_FROM` | 仅填写发信邮箱地址，例如 `noreply@example.com`；域名必须已在 Resend 验证，显示名称由应用设置为「云占」 |
| `AUTH_DB` | D1 数据库绑定 |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile 的公开站点密钥；仅注册页会读取 |
| `TURNSTILE_SECRET_KEY` | Turnstile 服务端密钥，仅用于调用 Siteverify |

本地填写 `.dev.vars`，线上使用 Wrangler 交互式输入：

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put AUTH_EMAIL_FROM
npx wrangler secret put TURNSTILE_SITE_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
```

真实密钥不可提交 Git。生产环境必须使用 HTTPS；登录 Cookie 为 HttpOnly、Secure、SameSite=Lax。登录后跳转仅允许站内页面。未完成配置时账户界面会显示暂不可用。

### 3. 验证码邮件

在 [Resend Domains](https://resend.com/domains) 添加发信域名，按控制台要求配置 DNS，等待验证通过。然后在 [Resend API Keys](https://resend.com/api-keys) 创建具备 [Sending access 权限](https://resend.com/docs/api-reference/api-keys/create-api-key)的密钥，限制到该域名，并分别填写 `RESEND_API_KEY` 和该域名下的 `AUTH_EMAIL_FROM`。

邮件同时包含中文纯文本和 HTML 内容。本地开发与生产环境都会调用 Resend 并使用其发送额度，验证码需要从收件箱查看。若尚未验证域名，可临时使用 `AUTH_EMAIL_FROM=onboarding@resend.dev` 测试，但收件人仅限 Resend 账户自身邮箱，详见 [Resend 测试域名限制](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)。自动化测试会拦截 HTTP 请求，不需要真实 Resend 密钥。

注册验证码在确认 Resend 接受发送后返回；发送失败会清除本次临时记录并提示重试。找回密码的邮件任务由当前请求的 `ctx.waitUntil()` 执行。Resend 请求在 10 秒后超时；非成功 HTTP 状态和网络错误都会作为发送失败处理。找回密码发送失败记录通用服务端错误，需要检查服务端日志和 Resend 控制台的投递情况。应用日志不会记录密钥、验证码、邮件内容或 Resend 原始错误响应。

### 4. 注册安全验证

点击「获取验证码」后，「创建账户」卡片内部会水平、垂直居中显示并自动运行 [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)，验证通过后弹层自动关闭并发送邮箱验证码；打开注册页时不会提前显示验证。服务端调用 Siteverify，并校验 `success`、动作 `register_email` 和 `BETTER_AUTH_URL` 对应的主机名。每次点击获取或重发验证码都会创建新的 widget 和一次性 token；关闭或取消验证不会发送邮件。

`.dev.vars.example` 提供 [Cloudflare 官方自动通过测试密钥](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)。测试密钥仍会调用 Siteverify，仅对这对官方测试密钥接受固定的测试主机名和动作。发布前将 `TURNSTILE_SITE_KEY` 和 `TURNSTILE_SECRET_KEY` 替换为正式 widget 的对应密钥，真实密钥不接受测试元数据。

### 行为与验证

- 登录使用邮箱和密码；邮箱验证码仅用于完成注册和找回密码，服务端已禁用验证码登录接口及登录验证码发送。
- 第一步填写昵称、邮箱和邮箱验证码。验证成功后进入设置密码的第二步；在此之前只存在临时注册记录，不创建用户、密码或登录会话，也不能通过找回密码完成注册。
- 第二步填写并确认密码后，服务端在一个 D1 事务中创建已验证用户、保存密码哈希并消费注册凭证，成功后自动登录。凭证绑定已验证邮箱和昵称，10 分钟内有效且只能使用一次；刷新或返回修改邮箱后需要重新验证。
- 旧的直接注册和邮箱验证接口已关闭。现有账户不能通过注册验证码获取会话，密码登录不会发送验证码。
- 验证码为 6 位数字，有效期 5 分钟，最多允许 3 次验证尝试；重新发送后旧码失效，数据库保存验证码哈希。
- 密码长度为 8–128 字符，使用 Better Auth 默认密码哈希。
- 重置密码后旧密码及所有旧会话失效，需要重新登录；会话最长 7 天，每天刷新有效期。
- 认证限流存储在 D1，使用 Cloudflare 提供的客户端 IP；发送注册验证码和完成注册每 IP 每分钟最多 3 次，验证邮箱最多 5 次；同一邮箱每 60 秒只能发送一次注册验证码。
- 当前账户系统不限制匿名排盘或 AI 解读，不包含历史同步、第三方登录、手机号或邮箱修改。

```bash
npm run test:auth
npm run typecheck
npm run build
```

测试在临时 D1 中检查真实 Better Auth 请求处理、迁移兼容性、验证码并发消费、密码和会话失效、限流与来源校验。邮件通过模拟 Resend HTTP 响应捕获，同时验证鉴权失败、限流、服务错误和网络超时的脱敏处理。测试不会发送真实邮件、创建真实 OpenRouter Key 或消耗模型费用，也不会修改本地或线上业务数据库。

`npm run test:auth:worker` 会额外验证生产构建在 Workers 中的运行情况，包括 Turnstile 校验、注册验证码发送、邮箱验证后仍不可登录、设置密码后完成注册、账户页面 SSR、Cookie 传递，以及页面数据不包含会话令牌或 Turnstile 服务端密钥。这个测试使用临时数据库，并拦截全部出站请求。

## 部署

首次部署前登录 Cloudflare：

```bash
npx wrangler login
```

线上环境必须配置上文账户 secrets 和以下三项 AI secrets，并先完成全部 D1 迁移、Resend 发信域名验证，以及目标 OpenRouter Workspace 的两个 Preset：

```bash
npx wrangler secret put OPENROUTER_MANAGEMENT_KEY
npx wrangler secret put OPENROUTER_WORKSPACE_ID
npx wrangler secret put AI_KEY_ENCRYPTION_SECRET
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
