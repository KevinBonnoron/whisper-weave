# Whisper Weave

A plugin-based LLM chat system built as a full-stack TypeScript monorepo. Connect to multiple platforms, use different LLM providers, and extend capabilities with tools.

## Features

- **Multi-Platform Connectors** - Connect to Discord, Gmail/Google, and other platforms via connector plugins
- **Multiple LLM Providers** - Use Claude, Ollama, or other LLM providers
- **Extensible Tool System** - Add capabilities like web search, Home Assistant control, file management, and custom skills
- **Web UI** - Manage conversations, plugins, assistants, and settings through a modern interface
- **Plugin Architecture** - Single plugins can implement multiple capabilities (connector, LLM provider, tools)

## Tech Stack

Built on the **bhvr stack**: Bun + Hono + Vite + React, with PocketBase as the database.

- **Runtime**: [Bun](https://bun.sh)
- **Backend**: [Hono](https://hono.dev)
- **Frontend**: [React](https://react.dev) + [Vite](https://vitejs.dev) + [TanStack Router](https://tanstack.com/router)
- **Database**: [PocketBase](https://pocketbase.io)
- **Styling**: Tailwind CSS + Radix UI

## Project Structure

```
.
├── client/         # React frontend (TanStack Router)
├── server/         # Hono backend API
├── db/             # PocketBase instance and migrations
├── shared/         # Shared TypeScript types
└── turbo.json      # Turbo build orchestration
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed
- [PocketBase](https://pocketbase.io) (included in `db/`)

### Installation

```bash
bun install
```

### Development

```bash
# Run all workspaces with hot reload
bun run dev
```

This starts:
- **Client**: http://localhost:5173
- **Server**: http://localhost:3000
- **Database**: http://localhost:8090

### Individual Workspaces

```bash
# Client
cd client && bun run dev

# Server
cd server && bun run dev

# Database
cd db && bun run dev
```

### Building

```bash
bun run build
```

## Plugin System

Plugins are single classes that can implement one or more capabilities:

| Capability | Interface | Description |
|------------|-----------|-------------|
| **Connector** | `ConnectorCapability` | Connect to external platforms (Discord, Google) |
| **LLM Provider** | `LLMCapability` | Wrap LLM APIs (Claude, Ollama) |
| **Tools** | `ToolsCapability` | Expose tools for LLM to call (web search, files) |

### Available Plugins

- **Discord** - Connector + Tools
- **Google** - Gmail/Calendar connector
- **Claude** - Anthropic LLM provider
- **Ollama** - Local LLM provider
- **Web Search** - Search tool
- **Home Assistant** - Smart home control
- **Files** - File system access
- **Skills** - Custom skill management

### Creating a Plugin

1. Create a plugin class in `server/src/plugins/`
2. Implement `PluginBase` and desired capabilities
3. Register in `server/src/plugins/catalog-metadata.ts`
4. Add instantiation case in `server/src/services/plugin-manager.service.ts`

See [CLAUDE.md](CLAUDE.md) for detailed plugin development documentation.

## Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Connector  │────▶│   Server    │────▶│     LLM     │
│  (Discord)  │     │   (Hono)    │     │   (Claude)  │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Tools    │
                    │ (Web, Files)│
                    └─────────────┘
```

1. Messages arrive from connectors (Discord, Gmail, Web UI)
2. Server routes to the appropriate assistant configuration
3. LLM generates responses, optionally calling tools
4. Tool results feed back into the LLM loop (max 10 iterations)
5. Final response is sent back via the connector

## Environment Variables

### Server

| Variable                | Description          | Default                 |
|-------------------------|----------------------|-------------------------|
| `PB_URL`                | PocketBase URL       | `http://localhost:8090` |
| `PB_SUPERUSER_EMAIL`    | Admin email          | -                       |
| `PB_SUPERUSER_PASSWORD` | Admin password       | -                       |
| `CORS_ORIGINS`          | Allowed CORS origins | `*`                     |

### Client

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_SERVER_URL` | Backend API URL | `http://localhost:3000` |

## Scripts

```bash
bun run dev          # Development mode (all workspaces)
bun run build        # Build all workspaces
bun run lint         # Lint with Biome
bun run format       # Format with Biome
bun run type-check   # TypeScript type checking
```

## License

MIT
