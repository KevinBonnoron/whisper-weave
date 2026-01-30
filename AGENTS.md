# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Whisper Weave is a plugin-based LLM chat system built as a full-stack TypeScript monorepo. It allows users to:
- Connect to multiple chat platforms (Discord, Gmail/Google, etc.) via connector plugins
- Use different LLM providers (Claude, Ollama) via provider plugins
- Extend LLM capabilities with tool plugins (web search, Home Assistant, files, skills, etc.)
- Manage conversations through a web UI or external platforms

Built on the bhvr stack: Bun + Hono + Vite + React, with PocketBase as the database.

## Development Commands

```bash
# Install dependencies
bun install

# Development (all workspaces with hot reload)
bun run dev

# Build all workspaces
bun run build

# Lint with Biome
bun run lint

# Format with Biome
bun run format

# Type checking
bun run type-check
```

### Individual Workspace Commands

```bash
# Client (runs on http://localhost:5173 by default)
cd client && bun run dev
cd client && bun run build

# Server (runs on http://0.0.0.0:3000)
cd server && bun run dev
cd server && bun run build

# Database (PocketBase runs on http://0.0.0.0:8090)
cd db && bun run dev
cd db && bun run migrate:collections
```

## Architecture

### Monorepo Structure

- **`client/`** - React frontend with TanStack Router
  - Routes: `/` (dashboard), `/conversations`, `/plugins`, `/assistants`, `/skills`, `/settings`
  - Uses PocketBase client for data fetching
  - Styled with Tailwind CSS and Radix UI components

- **`server/`** - Hono backend API
  - Routes: `/api/chat`, `/api/plugins`, `/api/auth`, `/api/skills`
  - Manages plugin lifecycle and in-memory instances via `serverPluginManager`
  - Handles LLM tool-use loops (max 10 iterations)

- **`db/`** - PocketBase instance
  - Collections: `plugins`, `conversations`, `assistants`
  - Schema in `db/pb_migrations/`

- **`shared/`** - Shared TypeScript types
  - Plugin interfaces: `Connector`, `LLM`, `Tool`, `ToolParameter`, `ToolContext`
  - API types: `PluginInstance`, `CatalogEntry`, `GetPluginsResponse`
  - LLM types: `LLMMessage`, `LLMResponse`, `ToolUse`, `Model`, `LLMGenerateOptions`
  - Database types: `PluginRecord`, `ConversationRecord`, `AssistantRecord`

### Plugin System: Capabilities and Interfaces

Plugins are **single classes** that can implement one or more **capabilities**. Capabilities are defined in [server/src/types/plugin-system.ts](server/src/types/plugin-system.ts); the actual behaviour interfaces live in [shared/src/types/plugins.type.ts](shared/src/types/plugins.type.ts).

**Base (all plugins):**

- **`PluginBase`** (server): `metadata: PluginMetadata`, `shutdown(): Promise<void>`

**Capabilities (server types):**

1. **`ConnectorCapability`** — `getConnector(): Connector`
   - Implemented by plugins that connect to external platforms (Discord, Google, etc.)
   - **`Connector`** (shared): `platform`, `connect()`, `disconnect()`, `isConnected()`, `onMessage(callback)`, optional `onSlashCommand`, `sendMessage`, `sendTyping`
   - Example: [server/src/plugins/discord.ts](server/src/plugins/discord.ts), [server/src/plugins/google.ts](server/src/plugins/google.ts)

2. **`LLMCapability`** — `getLLM(): LLM`
   - Implemented by plugins that wrap LLM APIs (Claude, Ollama)
   - **`LLM`** (shared): `getAvailableModels(): Model[]`, `generate(model, messages, options?)`, optional `streamGenerate`
   - Example: [server/src/plugins/claude.ts](server/src/plugins/claude.ts), [server/src/plugins/ollama.ts](server/src/plugins/ollama.ts)

3. **`ToolsCapability`** — `getTools(): ToolWithHandler[]`, optional `requestApproval(tool, input, context)`
   - Implemented by plugins that expose tools for the LLM to call
   - **`Tool`** (shared): `name`, `description`, `parameters`, `requiresApproval`. **`ToolWithHandler`** (server): extends `Tool` with `handler(input, context)`
   - **`ToolContext`** (shared): `userId`, `channelId`, `platform`, `message`
   - Example: [server/src/plugins/web-search.ts](server/src/plugins/web-search.ts), [server/src/plugins/home-assistant.ts](server/src/plugins/home-assistant.ts), [server/src/plugins/files.ts](server/src/plugins/files.ts), [server/src/plugins/skills.ts](server/src/plugins/skills.ts)

A plugin can implement **multiple capabilities** (e.g. Discord: `ConnectorCapability` + `ToolsCapability`). The catalog describes this via **`CatalogEntry.features`**: `Array<'connector' | 'tools' | 'llm-provider'>`.

**Type guards** (server): `hasConnector(plugin)`, `hasLLM(plugin)`, `hasTools(plugin)` — [server/src/utils/plugin.utils.ts](server/src/utils/plugin.utils.ts). Use `toTools(toolWithHandlers)` to strip handlers before passing tools to the LLM.

### Plugin Lifecycle

1. **Persistence**: Plugin instances are stored in the PocketBase `plugins` collection (id, type, name, enabled, config).
2. **Server startup**: [server/src/lib/plugin.ts](server/src/lib/plugin.ts) — `initialSyncFromPb()` loads all enabled plugins into memory via `serverPluginManager.addPlugin()`.
3. **Realtime sync**: `subscribeToPlugins()` subscribes to the PocketBase `plugins` collection; create/update/delete events load, reconfigure, or unload instances (no 5-second polling).
4. **In-memory**: `serverPluginManager` keeps a single `Map<string, InstanceEntry>`; each entry holds one plugin instance that may expose connector, LLM, and/or tools via the capability interfaces.
5. **Configuration**: Each instance has a `config` object passed to the plugin constructor; changes trigger `configurePlugin()` (reload with new config).

### Connector → LLM → Tools Flow

When a message arrives from a connector (e.g. Discord):

1. Connector plugin calls `onMessage()` callback with `Message`.
2. `handleConnectorMessage()` finds the `AssistantRecord` for that connector (by `connector = "<instanceId>"`).
3. Assistant config defines `llmProvider`, `llmModel`, and `actions` (array of plugin instance IDs that provide tools).
4. `generateWithTools()` runs the agentic loop:
   - Calls the LLM’s `generate(model, messages, { tools })` (tools are stripped via `toTools()` so handlers are not sent).
   - If the LLM returns `toolUses`, each is resolved via `executeTool(instanceId, toolName, input, context)`: the plugin-manager finds the `ToolWithHandler` by name, optionally calls `requestApproval(tool, input, context)`, then calls `tool.handler(input, context)`.
   - Tool results are appended as `role: 'tool'` messages; loop continues until no tool uses or max iterations (10).
5. Final response is sent via the connector’s `sendMessage()`.
6. Conversation is persisted to the PocketBase `conversations` collection.

### Key Files for Plugin Development

- **Plugin catalog**: [server/src/plugins/catalog-metadata.ts](server/src/plugins/catalog-metadata.ts) — registry of available plugins and their `features` (connector, tools, llm-provider).
- **Plugin manager**: [server/src/services/plugin-manager.service.ts](server/src/services/plugin-manager.service.ts) — `serverPluginManager`: add/configure/unload instances, `loadPlugin(type, config)`, connector/LLM/tool dispatch.
- **Capability types**: [server/src/types/plugin-system.ts](server/src/types/plugin-system.ts) — `PluginBase`, `ConnectorCapability`, `LLMCapability`, `ToolsCapability`, `ToolWithHandler`.
- **Shared interfaces**: [shared/src/types/plugins.type.ts](shared/src/types/plugins.type.ts) — `Connector`, `LLM`, `Tool`, `ToolContext`, `Message`, `Model`, etc.
- **Plugin sync**: [server/src/lib/plugin.ts](server/src/lib/plugin.ts) — `initialSyncFromPb()`, `subscribeToPlugins()`.

### Environment Variables

Server configuration is in [server/src/lib/config.ts](server/src/lib/config.ts):

- `PB_URL` - PocketBase URL (default: `http://localhost:8090`)
- `PB_SUPERUSER_EMAIL` - Admin email for PocketBase auth
- `PB_SUPERUSER_PASSWORD` or `/run/secrets/pb_superuser_password` - Admin password (supports Docker secrets)
- `CORS_ORIGINS` - Allowed CORS origins (default: `*`)
- `CORS_CREDENTIALS` - Enable CORS credentials (default: `false`)
- `CORS_MAX_AGE` - CORS preflight cache duration (default: `600`)

Client uses:
- `VITE_SERVER_URL` - Backend API URL (default: `http://localhost:3000`)

### Adding a New Plugin

1. Create a plugin class in [server/src/plugins/](server/src/plugins/) (e.g. `my-plugin.ts`).
2. Implement `PluginBase` and one or more capabilities: `ConnectorCapability`, `LLMCapability`, `ToolsCapability` (see [server/src/types/plugin-system.ts](server/src/types/plugin-system.ts) and [shared/src/types/plugins.type.ts](shared/src/types/plugins.type.ts)).
3. Register it in the catalog: [server/src/plugins/catalog-metadata.ts](server/src/plugins/catalog-metadata.ts) — add a `CatalogEntry` with the correct `features` array.
4. Add a case in `loadPlugin()` in [server/src/services/plugin-manager.service.ts](server/src/services/plugin-manager.service.ts) to instantiate your plugin (e.g. `case 'my-plugin': return new MyPlugin(config)`).
5. After server restart, the plugin appears in the UI and can be added/configured via the plugins API.

### PocketBase Collections

- **`plugins`**: Plugin instances (id, type, name, enabled, config).
- **`conversations`**: Chat history (title, messages[], connectorId?, channelId?).
- **`assistants`**: Per-connector config (connector, llmProvider, llmModel, actions[], systemPrompt?).

Schema is defined in `db/pb_migrations/`.

### Type Sharing Pattern

Types in `shared/` are exported via [shared/src/index.ts](shared/src/index.ts) and imported with the workspace protocol:

```typescript
import type { PluginRecord, LLMMessage, Connector, LLM, Tool } from '@whisper-weave/shared';
```

Server-only capability and plugin types are in `server/src/types/plugin-system.ts`.

### Client Routing

Uses TanStack Router with file-based routing:
- Routes in `client/src/routes/`
- Route tree: [client/src/routeTree.gen.ts](client/src/routeTree.gen.ts)
- Root layout: [client/src/routes/__root.tsx](client/src/routes/__root.tsx)

### Tool Use Protocol

LLM providers implement the shared `LLM` interface:
- **Request**: `generate(model, messages, { tools })` with optional `tools` array (schema only, no handlers).
- **Response**: Return `toolUses[]` when the model wants to call tools; each has `id`, `name`, `input`.
- **Next turn**: Append assistant message with `toolUses`, then tool result messages with `role: 'tool'`, `toolCallId`, `toolName`, `content` (JSON string).
- **Loop**: Continue until no tool uses or max iterations.

See [server/src/plugins/claude.ts](server/src/plugins/claude.ts) and [server/src/plugins/ollama.ts](server/src/plugins/ollama.ts) for provider implementations.
