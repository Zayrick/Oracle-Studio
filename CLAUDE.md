# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Oracle Studio is a divination application built with React Router 7 and deployed on Cloudflare Workers. The application provides multiple divination methods including Tarot, BaZi (八字), and LiuYao (六爻).

## Technology Stack

- **Framework**: React Router 7 with SSR enabled
- **Runtime**: Cloudflare Workers (Node.js compatibility enabled)
- **UI Framework**: shadcn/ui with `base-luma` preset using `@base-ui/react`
- **Styling**: TailwindCSS v4 with CSS variables and dark mode support
- **Icons**: lucide-react
- **Font**: Inter Variable

## Development Commands

```bash
# Start development server with HMR at http://localhost:5173
npm run dev

# Type checking (generates Cloudflare types, React Router types, and runs tsc)
npm run typecheck

# Build for production
npm run build

# Preview production build locally
npm run preview

# Deploy to Cloudflare Workers
npm run deploy

# Generate Cloudflare Worker types only
npm run cf-typegen
```

## Architecture

### Directory Structure

- `app/` - Main application code (maps to `@/*` path alias)
  - `routes/` - React Router route modules
  - `components/` - React components
    - `ui/` - shadcn/ui components (managed by shadcn CLI)
  - `lib/` - Utility libraries and helpers
  - `app.css` - Global styles with TailwindCSS imports and theme configuration
  - `root.tsx` - Root layout with Navbar and error boundaries
  - `routes.ts` - Route configuration
- `workers/` - Cloudflare Worker entry point
- `public/` - Static assets

### Routing

Routes are defined in `app/routes.ts` using React Router's file-based routing configuration. The application supports both English and Chinese route paths:
- `/` - Home page
- `/tarot` - Tarot divination
- `/八字` - BaZi divination
- `/六爻` - LiuYao divination

### UI Component Management

**shadcn/ui Configuration** (`components.json`):
- Style: `base-luma` preset
- Components are installed to `app/components/ui/`
- Uses TailwindCSS variables with `neutral` base color
- Icon library: lucide-react

**CRITICAL shadcn Component Guidelines**:
1. **DO NOT modify shadcn components directly** in `app/components/ui/`
2. **DO** use external styles or wrapper components to customize appearance
3. When adding new shadcn components, use: `npx shadcn add <component-name>`
4. Components can be overridden via TailwindCSS classes or wrapping components

### Styling System

The project uses TailwindCSS v4 with:
- CSS imports in `app/app.css` using `@import "tailwindcss" source(".")`
- shadcn's design tokens via CSS variables (oklch color space)
- Dark mode via `.dark` class variant
- Custom theme tokens defined in `@theme inline` block
- Inter Variable font family

## Development Guidelines

### Before Making Changes

**ALWAYS verify latest API documentation** before implementing features or modifying code:
- Use web search or web fetch tools to check current React Router 7 API
- Verify shadcn/ui component APIs and usage patterns
- Check Cloudflare Workers API documentation for worker-specific features
- Ensure examples and patterns are current, not based on outdated versions

### Code Architecture Principles

1. **Open-Closed Principle**: Design components and modules to be open for extension but closed for modification
2. **Strict File Organization**: Maintain clean separation between routes, components, utilities, and UI elements
3. **Path Aliases**: Use `@/` prefix for imports from the `app/` directory
4. **Type Safety**: TypeScript strict mode is enabled; maintain full type coverage

### Component Development

- **Prefer shadcn native components** unless explicitly instructed otherwise
- Create custom components in `app/components/`
- Use composition over modification for shadcn components
- Follow React 19 patterns and conventions
- Utilize class-variance-authority (CVA) for variant-based component APIs

### Worker Configuration

The Cloudflare Worker is configured in `wrangler.jsonc`:
- Entry point: `workers/app.ts`
- Node.js compatibility enabled via `nodejs_compat` flag
- Observability and source maps enabled
- Access environment variables via `VALUE_FROM_CLOUDFLARE` binding

### Type Generation

Types are auto-generated and must be kept in sync:
- Run `npm run typecheck` to regenerate all types
- Cloudflare Worker types: `worker-configuration.d.ts`
- React Router types: `.react-router/types/`
- The `postinstall` script automatically generates Cloudflare types

## Cloudflare Deployment

The application is deployed to Cloudflare Workers:
- Production: `npm run deploy` (builds and deploys)
- Preview deployments: `npx wrangler versions upload`
- Gradual rollout: `npx wrangler versions deploy`

## UI Customization

To customize shadcn components without modifying them:

```tsx
// ❌ Bad: Modifying app/components/ui/button.tsx directly

// ✅ Good: Override with Tailwind classes
<Button className="bg-custom-color hover:bg-custom-hover" />

// ✅ Good: Create a wrapper component
export function CustomButton(props) {
  return <Button {...props} className={cn("bg-custom-color", props.className)} />
}
```

## Notes

- SSR is enabled by default in `react-router.config.ts`
- The project uses React Router v7 future flags for upcoming features
- TailwindCSS v4 uses a new syntax with `@import "tailwindcss" source(".")`
- Dark mode uses class-based strategy with `.dark` variant
