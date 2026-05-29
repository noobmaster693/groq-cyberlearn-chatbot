import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const requestStore = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 20;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const record = requestStore.get(ip) || { count: 0, start: now };

  if (now - record.start > WINDOW_MS) {
    record.count = 0;
    record.start = now;
  }

  record.count += 1;
  requestStore.set(ip, record);

  if (record.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: "Trop de demandes. Réessaie dans une minute."
    });
  }

  next();
}

app.post("/api/chat", rateLimit, async (req, res) => {
  try {
    if (!GROQ_API_KEY) {
      return res.status(500).json({
        error: "La clé API Groq n'est pas configurée."
      });
    }

    const { message, history = [] } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Message invalide."
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        error: "Le message est trop long."
      });
    }

    const cleanHistory = Array.isArray(history)
      ? history
          .filter((item) => item.role === "user" || item.role === "assistant")
          .filter((item) => typeof item.content === "string")
          .slice(-8)
      : [];

    const systemPrompt = `
Tu es un assistant pédagogique intégré dans un cours Cyberlearn.
Tu réponds clairement, simplement et de manière structurée.
Tu aides les étudiants à comprendre le contenu du cours.
Tu ne fais pas le travail à leur place si c'est une évaluation.
Tu encourages l'apprentissage, les exemples et les explications étape par étape.
`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          ...cleanHistory,
          {
            role: "user",
            content: message
          }
        ],
        temperature: 0.4,
        max_completion_tokens: 700
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Erreur avec Groq API."
      });
    }

    const reply = data.choices?.[0]?.message?.content || "Je n'ai pas pu générer de réponse.";

    return res.json({ reply });
  } catch (error) {
    return res.status(500).json({
      error: "Erreur serveur. Vérifie la configuration."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Chatbot lancé sur http://localhost:${PORT}`);
});