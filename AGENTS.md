# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 项目概述

Oracle Studio 是一个使用 React Router 7 构建并部署在 Cloudflare Workers 上的占卜应用程序。该应用提供多种占卜方法，包括塔罗牌、八字和六爻。

## 技术栈

- **框架**: React Router 7，启用 SSR
- **运行时**: Cloudflare Workers（启用 Node.js 兼容性）
- **UI 框架**: shadcn/ui，使用 `base-luma` 预设和 `@base-ui/react`
- **样式**: TailwindCSS v4，支持 CSS 变量和暗黑模式
- **图标**: lucide-react
- **字体**: Inter Variable

## 开发命令

除非用户明确要求启动本地服务，否则不要主动运行 `npm run dev`、`npm run preview` 或其他会占用端口的本地 dev/preview 服务。需要验证时优先使用 `npm run typecheck`、`npm run build` 等一次性命令。

```bash
# 启动开发服务器，支持 HMR，访问 http://localhost:5173
npm run dev

# 类型检查（生成 Cloudflare 类型、React Router 类型并运行 tsc）
npm run typecheck

# 生产环境构建
npm run build

# 本地预览生产构建
npm run preview

# 部署到 Cloudflare Workers
npm run deploy

# 仅生成 Cloudflare Worker 类型
npm run cf-typegen
```

## 架构

### 目录结构

- `app/` - 主应用代码（映射到 `@/*` 路径别名）
  - `routes/` - React Router 路由模块
  - `components/` - React 组件
    - `ui/` - shadcn/ui 组件（由 shadcn CLI 管理）
  - `lib/` - 工具库和辅助函数
  - `app.css` - 全局样式，包含 TailwindCSS 导入和主题配置
  - `root.tsx` - 根布局，包含导航栏和错误边界
  - `routes.ts` - 路由配置
- `workers/` - Cloudflare Worker 入口点
- `public/` - 静态资源

### 路由

路由在 `app/routes.ts` 中使用 React Router 的基于文件的路由配置定义。应用支持英文和中文路由路径：
- `/` - 首页
- `/tarot` - 塔罗牌占卜
- `/八字` - 八字占卜
- `/六爻` - 六爻占卜

### UI 组件管理

**shadcn/ui 配置** (`components.json`)：
- 样式: `base-luma` 预设
- 组件安装到 `app/components/ui/`
- 使用 TailwindCSS 变量，基础颜色为 `neutral`
- 图标库: lucide-react

**关键的 shadcn 组件使用准则**：
1. **禁止直接修改** `app/components/ui/` 中的 shadcn 组件
2. **必须使用** 外部样式或包装组件来自定义外观
3. 添加新的 shadcn 组件时，使用：`npx shadcn add <component-name>`
4. 可以通过 TailwindCSS 类或包装组件来覆盖组件样式

### 样式系统

项目使用 TailwindCSS v4，具有以下特性：
- 在 `app/app.css` 中使用 `@import "tailwindcss" source(".")` 导入 CSS
- 通过 CSS 变量使用 shadcn 的设计令牌（oklch 色彩空间）
- 通过 `.dark` 类变体支持暗黑模式
- 在 `@theme inline` 块中定义自定义主题令牌
- 使用 Inter Variable 字体

## 开发指南

### 修改代码前的必要步骤

**在实现功能或修改代码前，必须验证最新的 API 文档**：
- 使用网页搜索或网页抓取工具检查当前的 React Router 7 API
- 验证 shadcn/ui 组件的 API 和使用模式
- 检查 Cloudflare Workers API 文档以了解 Worker 特定功能
- 确保使用的示例和模式是最新的，而非基于过时版本

### 代码架构原则

1. **开闭原则**：设计组件和模块时，对扩展开放，对修改封闭
2. **严格的文件组织**：在路由、组件、工具和 UI 元素之间保持清晰的分离
3. **路径别名**：从 `app/` 目录导入时使用 `@/` 前缀
4. **类型安全**：启用 TypeScript 严格模式；保持完整的类型覆盖

### 组件开发

- **优先使用 shadcn 原生组件**，除非明确指示使用其他方案
- 在 `app/components/` 中创建自定义组件
- 对 shadcn 组件使用组合而非修改的方式
- 遵循 React 19 的模式和约定
- 使用 class-variance-authority (CVA) 实现基于变体的组件 API

### Worker 配置

Cloudflare Worker 在 `wrangler.jsonc` 中配置：
- 入口点：`workers/app.ts`
- 通过 `nodejs_compat` 标志启用 Node.js 兼容性
- 启用可观察性和源码映射

### 类型生成

类型是自动生成的，必须保持同步：
- 运行 `npm run typecheck` 重新生成所有类型
- Cloudflare Worker 类型：`worker-configuration.d.ts`
- React Router 类型：`.react-router/types/`
- `postinstall` 脚本会自动生成 Cloudflare 类型

## Cloudflare 部署

应用部署到 Cloudflare Workers：
- 生产环境：`npm run deploy`（构建并部署）
- 预览部署：`npx wrangler versions upload`
- 渐进式发布：`npx wrangler versions deploy`

## UI 自定义

在不修改 shadcn 组件的情况下进行自定义：

```tsx
// ❌ 错误：直接修改 app/components/ui/button.tsx

// ✅ 正确：使用 Tailwind 类覆盖
<Button className="bg-custom-color hover:bg-custom-hover" />

// ✅ 正确：创建包装组件
export function CustomButton(props) {
  return <Button {...props} className={cn("bg-custom-color", props.className)} />
}
```

## 注意事项

- 在 `react-router.config.ts` 中默认启用 SSR
- 项目使用 React Router v7 的 future flags 以支持即将推出的功能
- TailwindCSS v4 使用新语法 `@import "tailwindcss" source(".")`
- 暗黑模式使用基于类的策略，通过 `.dark` 变体实现
