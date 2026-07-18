# CyberLearn Groq Assistant

A self-hosted, French-first AI study assistant for Cyberlearn projects. It uses the Groq API to answer course questions, analyze images and PDFs, retain browser-local chat history, and optionally research current information on the web.

## Features

- Groq-powered chat with configurable text and vision models
- Image analysis for JPEG, PNG, and WebP files
- Text extraction from PDFs and common source/document formats
- Optional Groq browser search when a question needs current context
- Multiple chat histories stored locally in the browser
- Configurable project context for course- or team-specific answers
- Light/dark themes and editable interface labels
- Basic per-IP request limiting

The interface and default assistant prompt are currently optimized for French-speaking students working on a technical or robotics project.

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer
- A [Groq API key](https://console.groq.com/keys)
- Access to the Groq models configured in your environment

## Quick start

```bash
git clone https://github.com/noobmaster693/groq-cyberlearn-chatbot.git
cd groq-cyberlearn-chatbot
npm install
cp .env.example .env
```

On Windows Command Prompt, use `copy .env.example .env` instead of `cp`.

Open `.env` and add your Groq API key:

```dotenv
GROQ_API_KEY=your_groq_api_key
```

Start the server:

```bash
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GROQ_API_KEY` | Yes | — | Authenticates requests to the Groq API. |
| `PORT` | No | `3000` | Port used by the Express server. |
| `GROQ_MODEL` | No | `openai/gpt-oss-120b` | Main text and reasoning model. |
| `GROQ_VISION_MODEL` | No | `meta-llama/llama-4-scout-17b-16e-instruct` | Model used to analyze attached images. |
| `PROJECT_CONTEXT` | No | Empty | Adds course, team, or project background to the assistant prompt. |
| `ENABLE_BROWSER_SEARCH` | No | `true` | Set to `false` to disable Groq browser search. |

Example project context:

```dotenv
PROJECT_CONTEXT=We are building a line-following robot with an Arduino and documenting the work for our final Cyberlearn project.
```

Model availability can change. If Groq reports that a model is unavailable, replace the corresponding model name with one enabled for your Groq account.

## Using the assistant

1. Open the app and choose **Chat** or **Python** from the options menu.
2. Enter a question in French or another language.
3. Optionally attach up to five files, including up to three images.
4. Send the question. Chat history is retained in that browser's local storage.

Supported attachments include:

- images: JPEG, PNG, and WebP;
- documents: PDF and plain-text formats;
- source files: JavaScript, TypeScript, Python, HTML, CSS, XML, Arduino, C, C++, Java, JSON, CSV, and Markdown.

Attachments are processed in memory for the current request. Extracted content and images are sent to Groq for analysis, so do not upload confidential material unless your data-handling requirements allow it.

## How it works

The Express server serves the browser interface and exposes `POST /api/chat`. For each request it:

1. validates the message, recent history, and attachments;
2. extracts PDF/text content and prepares images;
3. optionally runs vision analysis and web research;
4. sends the assembled context to the configured Groq model;
5. returns the final answer to the browser.

The project does not require a database. Chat history, display preferences, and custom labels remain in the browser's local storage.

## Deployment and security

Keep `GROQ_API_KEY` only in server-side environment variables. Never commit a populated `.env` file or expose the key in browser code.

The built-in rate limiter is intended for small deployments. Before exposing the app publicly, place it behind authentication and HTTPS, and review Groq usage limits and data-handling terms.

For platforms that inject a `PORT` variable, the application uses it automatically. The start command is:

```bash
npm start
```

## Troubleshooting

### “La clé API Groq n'est pas configurée”

Confirm that `.env` exists in the repository root, contains `GROQ_API_KEY`, and that you restarted the server after editing it.

### Model or permission error

Check the model names in `.env` against the models available to your Groq account.

### An attachment is rejected

Check its type and size. The server limits a request to five attachments, three images, and approximately 10 MB of JSON request data.

### Browser search fails

The assistant will still answer without web research. Set `ENABLE_BROWSER_SEARCH=false` if the configured model or account does not support the browser-search tool.

## Project status

This is a small educational project. Review generated answers before relying on them for assessments, safety decisions, or production systems.
