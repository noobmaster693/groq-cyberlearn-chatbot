# Cyberlearn Groq AI Course Assistant

A French-first web assistant for courses and student projects, powered by the Groq API. It combines a familiar chat interface with local conversation history, image understanding, PDF and text-file analysis, optional web research, and a CodeRunner-style workspace.

The project is designed for a Cyberlearn course space, but the assistant can be adapted to other classes, workshops, or project teams through environment variables—without changing the source code.

## Highlights

- Groq-powered conversational assistant with configurable language-model and vision-model IDs
- French-first interface that answers in the language used by the learner
- Multiple locally stored conversations with rename and delete controls
- Image analysis for JPEG, PNG, and WebP uploads
- PDF text extraction and support for common text/code file formats
- Optional Groq browser-search tool for questions that need current online context
- Custom project or course context through `PROJECT_CONTEXT`
- CodeRunner-style workspace for asking programming questions
- Light/dark theme and editable interface labels
- Basic in-memory rate limiting and attachment-size safeguards

## How it works

```text
Browser interface
  └─ POST /api/chat
       ├─ validates the request and attachments
       ├─ extracts text from PDFs and text files
       ├─ sends images to the configured vision model
       ├─ optionally performs browser research
       └─ sends the combined context to the main Groq model
```

Conversation history and interface preferences are stored in the browser. Uploaded files are processed for the current request and are not written to a repository folder by the server.

## Requirements

- Node.js 18 or newer, so the built-in `fetch` API is available
- npm
- A Groq API key

## Quick start

```bash
git clone https://github.com/noobmaster693/groq-cyberlearn-chatbot.git
cd groq-cyberlearn-chatbot
npm install
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Open `.env`, add your Groq API key, and then start the application:

```bash
npm start
```

Open `http://localhost:3000` in your browser.

For local development, the repository also provides:

```bash
npm run dev
```

Both scripts currently start the same Node.js server.

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GROQ_API_KEY` | Yes | — | API key used for all Groq requests |
| `GROQ_MODEL` | No | `openai/gpt-oss-120b` | Main text and reasoning model |
| `GROQ_VISION_MODEL` | No | `meta-llama/llama-4-scout-17b-16e-instruct` | Model used to prepare image-analysis context |
| `PROJECT_CONTEXT` | No | Empty | Course, assignment, team, or project information included in the system prompt |
| `ENABLE_BROWSER_SEARCH` | No | `true` | Set to `false` to disable browser-search requests |
| `PORT` | No | `3000` | HTTP port used by the Express server |

Example:

```dotenv
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=openai/gpt-oss-120b
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
ENABLE_BROWSER_SEARCH=true
PORT=3000
PROJECT_CONTEXT="Final-year robotics project. The team uses Python, Arduino, Git, and a weekly milestone plan."
```

Never commit a real `.env` file or API key.

## Using the assistant

### Chat mode

Use the chat view for normal questions. The browser sends the latest conversation messages to the server, which keeps up to 16 recent user/assistant messages for the current request.

The interface supports multiple browser-local chats. You can create, rename, switch, and delete them from the options drawer.

### File and image analysis

You can attach images, PDFs, and common text or source-code files. The server currently applies these limits:

- up to 5 attachments per request
- up to 3 images per request
- JPEG, PNG, and WebP image formats
- approximately 10 MB for the incoming JSON request
- extracted text is truncated to keep the model context manageable

For scanned PDFs without extractable text, provide screenshots of the relevant pages.

### Web research

Browser search is attempted when a question explicitly asks for online, current, recent, sourced, or verified information. Image questions may also trigger research when online context could help interpret the screenshot.

Set this in `.env` to disable that behavior:

```dotenv
ENABLE_BROWSER_SEARCH=false
```

Web research is treated as an enhancement. If the search tool is unavailable, the assistant still tries to answer from the question, attachments, and model knowledge.

### Course or project context

Use `PROJECT_CONTEXT` to make answers specific to your class or project:

```dotenv
PROJECT_CONTEXT="Cyberlearn workspace for a robotics capstone. Explain concepts for secondary-school students, use Python examples, and distinguish confirmed project facts from assumptions."
```

Keep sensitive student or organizational data out of this value when deploying to a shared environment.

## HTTP API

The browser uses one endpoint:

```text
POST /api/chat
Content-Type: application/json
```

Minimal request:

```json
{
  "message": "Explain how a PID controller works.",
  "history": [],
  "attachments": []
}
```

Successful response:

```json
{
  "reply": "...",
  "usedWebSearch": false
}
```

The endpoint returns JSON errors for missing configuration, invalid requests, oversized messages, unsupported attachments, Groq API failures, and rate-limit responses.

## Project structure

```text
.
├── server.js              # Express server, attachment handling, prompts, and Groq calls
├── package.json           # npm scripts and dependencies
└── public/
    ├── index.html         # Main browser interface
    ├── legacy.css         # Interface styling
    ├── legacy.js          # Client-side chat and file behavior
    └── legacy_patch_v17.js
```

## Deployment notes

The application can run on any Node.js host that supports environment variables and outbound HTTPS requests.

Before exposing it publicly:

- place it behind authentication or a trusted learning platform
- use HTTPS
- keep the Groq API key server-side
- add a persistent or distributed rate limiter for multi-instance deployments
- review upload limits for your hosting provider
- avoid putting confidential course material into public deployments

The included rate limiter is stored in memory, so it resets whenever the process restarts and is not shared between multiple server instances.

## Troubleshooting

### “La clé API Groq n'est pas configurée”

Confirm that `.env` exists in the repository root and contains a valid `GROQ_API_KEY`, then restart the server.

### The page opens but requests fail

Check the terminal running `npm start`. Groq API errors and browser-search fallback warnings are logged there.

### A model is unavailable

Change `GROQ_MODEL` or `GROQ_VISION_MODEL` to model IDs enabled for your Groq account. Restart the server after changing `.env`.

### PDF text is missing

The PDF parser extracts embedded text only. For scans or image-only pages, upload screenshots instead.

### Too many requests

The server allows 20 requests per IP address in a rolling one-minute in-memory window. Wait a minute or replace the limiter with infrastructure appropriate for your deployment.

## Responsible use

This assistant should support learning rather than impersonate a teacher, hide uncertainty, or expose private student data. Review model output before relying on it for assessment, safety-critical work, or factual claims that require authoritative sources.
