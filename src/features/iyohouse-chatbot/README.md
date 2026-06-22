# IYOHOUSE Chatbot

This feature keeps the iyohouse chatbot isolated inside the Next app.

## Main Edit Points

- `components/ChatbotWidget.tsx`: floating widget, chat window, FAQ shortcuts, and UI state.
- `styles/chatbot.css`: visual style, sizing, responsive behavior, and motion.
- `server/prompts/system-instruction.ts`: source-of-truth and behavior rules for the agent.
- `server/prompts/output-format.ts`: answer style and final response format guidance.
- `server/agent-harness.ts`: wiki tool loop, preflight page loading, trace handling, and source collection.
- `server/wiki-store.ts`: WikiWikiWiki page loading, public/private filtering, search, read, and list tools.
- `server/chatbot-service.ts`: Next API service layer, environment variables, API key mode, and health payload.

## Environment

Server-side production mode:

```env
GEMINI_API_KEY=
CHATBOT_WIKI_URL=https://dotiyo.dothome.co.kr
```

Optional:

```env
GEMINI_MODEL=gemini-3-flash-preview
GEMINI_THINKING_LEVEL=low
ENABLE_REQUEST_TRACE=true
CHATBOT_PREFER_WIKI_API=true
CHATBOT_WIKI_METADATA_PATH=
CHATBOT_WIKI_CONTENT_DIR=
```

## API Contract

The widget talks only to these local Next routes:

- `GET /api/chatbot/health`
- `GET /api/chatbot/pages`
- `POST /api/chatbot/ask`

Keeping these routes stable lets the UI evolve separately from the harness internals.
