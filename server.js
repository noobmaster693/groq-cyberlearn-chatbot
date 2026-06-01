import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pdfParse from "pdf-parse";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
const PROJECT_CONTEXT = process.env.PROJECT_CONTEXT || "";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const requestStore = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 20;
const MAX_ATTACHMENTS = 5;
const MAX_IMAGES = 3;
const MAX_TOTAL_IMAGE_DATA_URL_CHARS = 3_300_000;
const MAX_PDF_DATA_URL_CHARS = 4_500_000;
const MAX_ATTACHMENT_CONTEXT_CHARS = 28_000;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

app.use(express.json({ limit: "10mb" }));
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

function safeName(value) {
  return String(value || "fichier")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[<>]/g, "")
    .slice(0, 120);
}

function extractBase64(dataUrl) {
  if (typeof dataUrl !== "string") {
    return "";
  }

  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : "";
}

function normalizeText(text, maxChars = 12_000) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .slice(0, maxChars);
}

async function prepareAttachments(rawAttachments) {
  const attachments = Array.isArray(rawAttachments) ? rawAttachments.slice(0, MAX_ATTACHMENTS) : [];
  const images = [];
  const textSections = [];
  let totalImageChars = 0;
  let totalContextChars = 0;

  for (const item of attachments) {
    const kind = String(item?.kind || "");
    const name = safeName(item?.name);

    if (kind === "image") {
      const mimeType = String(item?.mimeType || "");
      const dataUrl = String(item?.dataUrl || "");

      if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
        throw new Error(`Format d'image non pris en charge pour ${name}.`);
      }

      if (!dataUrl.startsWith(`data:${mimeType};base64,`)) {
        throw new Error(`Image invalide : ${name}.`);
      }

      totalImageChars += dataUrl.length;

      if (images.length >= MAX_IMAGES) {
        throw new Error(`Tu peux envoyer au maximum ${MAX_IMAGES} images à la fois.`);
      }

      if (totalImageChars > MAX_TOTAL_IMAGE_DATA_URL_CHARS) {
        throw new Error("Les images sont trop volumineuses. Réduis leur taille ou envoie-les séparément.");
      }

      images.push({ name, mimeType, dataUrl });
      continue;
    }

    if (kind === "text") {
      const text = normalizeText(item?.text);

      if (!text) {
        continue;
      }

      const remaining = MAX_ATTACHMENT_CONTEXT_CHARS - totalContextChars;
      if (remaining <= 0) {
        break;
      }

      const section = `\n--- Fichier : ${name} ---\n${text.slice(0, remaining)}`;
      textSections.push(section);
      totalContextChars += section.length;
      continue;
    }

    if (kind === "pdf") {
      const dataUrl = String(item?.dataUrl || "");

      if (!dataUrl.startsWith("data:application/pdf;base64,")) {
        throw new Error(`PDF invalide : ${name}.`);
      }

      if (dataUrl.length > MAX_PDF_DATA_URL_CHARS) {
        throw new Error(`Le PDF ${name} est trop volumineux.`);
      }

      const buffer = Buffer.from(extractBase64(dataUrl), "base64");
      const parsed = await pdfParse(buffer);
      const pdfText = normalizeText(parsed.text);

      if (!pdfText) {
        textSections.push(`\n--- PDF : ${name} ---\nLe texte n'a pas pu être extrait automatiquement. Demande à l'utilisateur de fournir une capture d'écran des pages utiles.`);
        continue;
      }

      const remaining = MAX_ATTACHMENT_CONTEXT_CHARS - totalContextChars;
      if (remaining <= 0) {
        break;
      }

      const section = `\n--- PDF : ${name} ---\n${pdfText.slice(0, remaining)}`;
      textSections.push(section);
      totalContextChars += section.length;
    }
  }

  return {
    images,
    textContext: textSections.join("\n")
  };
}

app.post("/api/chat", rateLimit, async (req, res) => {
  try {
    if (!GROQ_API_KEY) {
      return res.status(500).json({
        error: "La clé API Groq n'est pas configurée."
      });
    }

    const { message = "", history = [], attachments = [] } = req.body;

    if (typeof message !== "string") {
      return res.status(400).json({
        error: "Message invalide."
      });
    }

    if (message.length > 4000) {
      return res.status(400).json({
        error: "Le message est trop long."
      });
    }

    if (!message.trim() && (!Array.isArray(attachments) || attachments.length === 0)) {
      return res.status(400).json({
        error: "Ajoute une question ou un fichier."
      });
    }

    const cleanHistory = Array.isArray(history)
      ? history
          .filter((item) => item.role === "user" || item.role === "assistant")
          .filter((item) => typeof item.content === "string")
          .slice(-16)
      : [];

    const { images, textContext } = await prepareAttachments(attachments);
    const userText = [
      message.trim() || "Analyse les fichiers joints et explique clairement les éléments utiles.",
      textContext ? `\nContenu extrait des fichiers joints :\n${textContext}` : ""
    ].join("");

    const systemPrompt = `
Tu es un assistant pédagogique fiable intégré dans un espace Cyberlearn consacré à un projet robotique de fin d'année.

Objectif : aider l'équipe à organiser le projet, clarifier les rôles, planifier les délais, expliquer les notions techniques, analyser les fichiers ou captures d'écran transmis et produire du code propre lorsqu'il est demandé.

Règles de qualité :
- Réponds dans la langue utilisée par l'utilisateur. En français, écris dans un français correct, naturel et sans fautes évitables.
- Ne donne pas une réponse vague ou trop courte lorsqu'une explication utile est nécessaire.
- Structure les réponses avec des étapes claires, des titres courts ou des listes seulement quand cela améliore la compréhension.
- Vérifie la cohérence de ta réponse avant de l'envoyer. Pour les calculs, détaille brièvement les étapes utiles.
- N'invente jamais une information propre au projet. Si une donnée manque, dis-le clairement et pose une question précise.
- Distingue les faits, les hypothèses et les recommandations.
- Pour le code : donne une solution exécutable, explique où la placer, indique les prérequis et utilise toujours des blocs Markdown avec trois accents graves et le langage, afin que le bouton Copier apparaisse.
- Lorsqu'un fichier ou une image est joint, cite son nom lorsque cela aide à comprendre ta réponse.
- Si une image n'est pas assez lisible, demande une capture plus nette ou un zoom sur la zone importante.
- Si l'utilisateur demande de l'aide pour une évaluation, essaye d'éxpliqué mais si sans succès, donne la réponse directement.

Contexte connu du projet :
${PROJECT_CONTEXT || "Aucun contexte spécifique n'a encore été fourni. Demande les informations manquantes lorsque la question dépend du projet."}
`;

    const userContent = images.length > 0
      ? [
          { type: "text", text: userText },
          ...images.map((image) => ({
            type: "image_url",
            image_url: { url: image.dataUrl }
          }))
        ]
      : userText;

    const selectedModel = images.length > 0 ? GROQ_VISION_MODEL : GROQ_MODEL;
    const requestBody = {
      model: selectedModel,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        ...cleanHistory,
        {
          role: "user",
          content: userContent
        }
      ],
      temperature: 0.2,
      max_completion_tokens: 1800
    };

    // GPT-OSS supports reasoning effort. Keep reasoning internal and return only the final answer.
    if (selectedModel.startsWith("openai/gpt-oss-")) {
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
    return res.status(400).json({
      error: error.message || "Erreur serveur. Vérifie la configuration."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Chatbot lancé sur http://localhost:${PORT}`);
});
