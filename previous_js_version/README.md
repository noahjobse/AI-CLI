# AI CLI

A fast, calm, reliable terminal chat for focused tasks. Single-user, interactive-only AI CLI built with TypeScript/Node.js.

## Features

- **Interactive terminal chat** with streaming responses
- **Durable sessions** with auto-save after every exchange
- **Session management** with recall, resume, search, and export
- **File attachment** and context import capabilities
- **Web search** with OpenAI web_search tool
- **Secure API key storage** with OS keychain or encrypted fallback
- **Multi-line input** support with Shift+Enter
- **Code block numbering** and clipboard integration
- **Session summaries** and statistics

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Link globally:**
   ```bash
   npm link
   ```

4. **Set your API key:**
   ```bash
   ai
   [gpt-4o-mini] > :apikey
   ```

5. **Start chatting:**
   ```bash
   ai
   [gpt-4o-mini] > Hello! How can you help me today?
   ```

## Commands

### Session Management
- `:recall` - List current month sessions
- `:resume <n>` - Resume session n
- `:find <keyword>` - Search current month
- `:delete <n>` - Delete session n
- `:rename <n> <slug>` - Rename session n

### AI Interaction
- `:model <name>` - Switch model
- `:redo` - Rerun last prompt
- `:undo` - Remove last Q+A pair
- `:summarize` - Generate session summary

### Files & Context
- `:file <path...>` - Attach files
- `:import <n>` - Import context from session n
- `:copy <n>` - Copy code block n
- `:export <path>` - Export current session

### Search
- `:search <query>` - Web search (uses OpenAI web_search tool)

### Utilities
- `:help` - Show help
- `:settings` - View/edit settings
- `:config` - Open config in editor
- `:stats` - Show session stats
- `:version` - Show version
- `:apikey` - Set API key

## Configuration

The CLI uses `~/.aicli/config.yaml` for configuration:

```yaml
version: 1
model: "gpt-4o-mini"
dataDir: "~/ai-sessions"
timeoutMinutes: 30
warnBeforeTimeoutSeconds: 120
defaultSearchProvider: "duckduckgo"
maxAttachBytes: 204800
importContextTokens: 4000
costsPer1kTokens:
  gpt-4o-mini:
    input: 0.00015
    output: 0.0006
keyStorage:
  method: "keytar"
  local:
    encryptedKeyPath: "~/.aicli/key.enc"
    saltPath: "~/.aicli/key.salt"
    ivPath: "~/.aicli/key.iv"
```

## Session Files

Sessions are stored in `~/ai-sessions/YYYY/MM/` with the format:
- `YYYY-MM-DD_HH-MM_<slug>.md` - Individual session files
- `index.md` - Monthly index of sessions

## Multi-line Input

Use `\` at the end of a line to continue input on the next line:
```
[gpt-4o-mini] > This is a multi-line
... > message that continues
... > on multiple lines
```

## Search

Web search is powered by OpenAI's built-in `web_search` tool, providing fast, reliable results with automatic citations.

## Security

API keys are stored securely using:
1. OS keychain (via `keytar`) - preferred
2. Encrypted local storage (AES-256-GCM) - fallback

## Requirements

- Node.js 18+
- OpenAI API key

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Test
npm test
```

## License

MIT


