import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const PROJECT_CONTEXT = process.env.PROJECT_CONTEXT || "";

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

    if (message.length > 4000) {
      return res.status(400).json({
        error: "Le message est trop long."
      });
    }

    const cleanHistory = Array.isArray(history)
      ? history
          .filter((item) => item.role === "user" || item.role === "assistant")
          .filter((item) => typeof item.content === "string")
          .slice(-16)
      : [];

    const systemPrompt = `
Tu es un assistant pédagogique fiable intégré dans un espace Cyberlearn consacré à un projet robotique de fin d'année.

Objectif : aider l'équipe à organiser le projet, clarifier les rôles, planifier les délais, expliquer les notions techniques et produire du code propre lorsqu'il est demandé.

Règles de qualité :
- Réponds dans la langue utilisée par l'utilisateur. En français, écris dans un français correct, naturel et sans fautes évitables.
- Ne donne pas une réponse vague ou trop courte lorsqu'une explication utile est nécessaire.
- Structure les réponses avec des étapes claires, des titres courts ou des listes seulement quand cela améliore la compréhension.
- Vérifie la cohérence de ta réponse avant de l'envoyer. Pour les calculs, détaille brièvement les étapes utiles.
- N'invente jamais une information propre au projet. Si une donnée manque, dis-le clairement et pose une question précise.
- Distingue les faits, les hypothèses et les recommandations.
- Pour le code : donne une solution exécutable, explique où la placer, indique les prérequis et utilise toujours des blocs Markdown avec trois accents graves et le langage, afin que le bouton Copier apparaisse.
- Pour une tâche complexe, propose une solution concrète et suffisamment détaillée, sans noyer l'utilisateur dans du texte inutile.
- Si l'utilisateur demande de l'aide pour une évaluation, explique la méthode et favorise l'apprentissage.

Contexte connu du projet :
${PROJECT_CONTEXT || "Aucun contexte spécifique n'a encore été fourni. Demande les informations manquantes lorsque la question dépend du projet."}
`;

    const requestBody = {
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
      temperature: 0.2,
      max_completion_tokens: 1800
    };

    // GPT-OSS supports reasoning effort. Keep reasoning internal and return only the final answer.
    if (GROQ_MODEL.startsWith("openai/gpt-oss-")) {
      requestBody.reasoning_effort = "medium";
      requestBody.reasoning_format = "hidden";
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
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
