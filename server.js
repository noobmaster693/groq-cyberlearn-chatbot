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

function buildSystemPrompt() {
  return `
Tu es un assistant pédagogique fiable intégré dans un espace Cyberlearn consacré à un projet robotique de fin d'année.

Objectif : aider l'équipe à organiser le projet, clarifier les rôles, planifier les délais, expliquer les notions techniques, analyser les fichiers ou captures d'écran transmis et produire du code propre lorsqu'il est demandé.

Règles de qualité :
- Réponds dans la langue utilisée par l'utilisateur. En français, écris dans un français correct, naturel et sans fautes évitables.
- Réponds d'abord à la question précise. Évite les introductions génériques et les rappels de contexte inutiles.
- Pour une question directe sur une capture d'écran, commence par la meilleure réponse probable en quelques phrases. Ne fournis pas un catalogue de possibilités génériques.
- Lorsque la question contient un mot vague comme « ceci », « ça » ou « this », indique brièvement l'action visible que tu penses que l'utilisateur désigne. Si l'action reste réellement ambiguë, donne ta meilleure interprétation prudente puis pose une seule question ciblée.
- Lorsque des images sont jointes, utilise l'analyse visuelle fournie pour relever les détails utiles, le texte visible, les actions observables et les indices de contexte.
- Si l'image ne permet pas une certitude complète, indique brièvement la limite sans transformer la réponse en longue liste d'hypothèses.
- N'invente pas de numéro d'épisode, de citation, de nom, d'action ou de détail narratif qui n'est pas suffisamment appuyé par l'image, l'historique ou la question.
- N'utilise pas de tableau Markdown pour une réponse narrative ou une question simple. Utilise un tableau seulement si l'utilisateur demande une comparaison ou si cela améliore clairement une tâche structurée.
- Ne prétends pas reconnaître une personne réelle avec certitude à partir d'une photo. Décris les éléments visibles et utilise uniquement le contexte fourni par l'utilisateur ou visible dans l'image.
- Ne donne pas une réponse vague ou trop courte lorsqu'une explication utile est nécessaire.
- Structure les réponses avec des étapes claires, des titres courts ou des listes seulement quand cela améliore la compréhension.
- Vérifie la cohérence de ta réponse avant de l'envoyer. Pour les calculs, détaille brièvement les étapes utiles.
- N'invente jamais une information propre au projet. Si une donnée manque, dis-le clairement et pose une question précise.
- Distingue les faits, les hypothèses et les recommandations.
- Pour le code : donne une solution exécutable, explique où la placer, indique les prérequis et utilise toujours des blocs Markdown avec trois accents graves et le langage, afin que le bouton Copier apparaisse.
- Lorsqu'un fichier ou une image est joint, cite son nom lorsque cela aide à comprendre ta réponse.
- Si une image n'est pas assez lisible, demande une capture plus nette ou un zoom sur la zone importante.
- Si l'utilisateur demande de l'aide pour une évaluation, essaye d'éxpliqué la méthode mais si sans succès, donne la réponse directement.

Contexte connu du projet :
${PROJECT_CONTEXT || "Aucun contexte spécifique n'a encore été fourni. Demande les informations manquantes lorsque la question dépend du projet."}
`;
}

async function callGroq({ model, messages, temperature = 0.2, maxCompletionTokens = 1800 }) {
  const requestBody = {
    model,
    messages,
    temperature,
    max_completion_tokens: maxCompletionTokens
  };

  if (model.startsWith("openai/gpt-oss-")) {
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
    const error = new Error(data.error?.message || "Erreur avec Groq API.");
    error.status = response.status;
    throw error;
  }

  return data.choices?.[0]?.message?.content || "";
}

async function analyzeImages(images, userQuestion) {
  const imageNames = images.map((image) => image.name).join(", ");
  const visionInstructions = `
Analyse soigneusement les images jointes pour aider un autre assistant à répondre à la question de l'utilisateur.

Question de l'utilisateur : ${userQuestion || "Analyse les images jointes."}
Noms des fichiers : ${imageNames}

Produis une note d'analyse utile et concise :
1. Décris les éléments visibles pertinents et identifie l'action principale la plus probable.
2. Si la question contient « ceci », « ça » ou « this », précise quelle action visible semble être visée.
3. Transcris le texte visible important, par exemple les sous-titres, messages d'erreur, boutons ou données.
4. Relève les indices de contexte visibles dans l'image.
5. Explique ce que l'image permet raisonnablement de déduire pour répondre à la question.
6. Signale clairement les incertitudes. N'invente pas de détails invisibles, de numéro d'épisode ou de contexte narratif non visible.
7. Pour une capture issue d'une fiction ou d'une vidéo, ne rédige pas un résumé générique de l'œuvre. Concentre-toi sur la scène affichée.
8. Ne prétends pas identifier un personnage uniquement à partir de son apparence. Utilise les noms seulement s'ils sont fournis par l'utilisateur ou visibles dans l'image.
`;

  const content = [
    { type: "text", text: visionInstructions },
    ...images.map((image) => ({
      type: "image_url",
      image_url: { url: image.dataUrl }
    }))
  ];

  return callGroq({
    model: GROQ_VISION_MODEL,
    messages: [{ role: "user", content }],
    temperature: 0.1,
    maxCompletionTokens: 1100
  });
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
    const question = message.trim() || "Analyse les fichiers joints et explique clairement les éléments utiles.";

    let visualContext = "";
    if (images.length > 0) {
      visualContext = await analyzeImages(images, question);
    }

    const enrichedUserText = [
      `Question de l'utilisateur :\n${question}`,
      textContext ? `\n\nContenu extrait des fichiers joints :\n${textContext}` : "",
      visualContext ? `\n\nAnalyse visuelle préparatoire des images jointes :\n${visualContext}` : "",
      visualContext ? "\n\nRéponds maintenant directement à la question de l'utilisateur. Appuie-toi sur l'analyse visuelle. Pour une question simple du type pourquoi/what/why, réponds en prose concise : donne d'abord la meilleure interprétation de l'action visible et son explication. N'utilise pas de tableau et n'énumère pas une liste de motifs génériques. Si le référent exact reste ambigu, ajoute seulement une question de clarification courte à la fin." : ""
    ].join("");

    const reply = await callGroq({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt()
        },
        ...cleanHistory,
        {
          role: "user",
          content: enrichedUserText
        }
      ],
      temperature: 0.2,
      maxCompletionTokens: 1800
    });

    return res.json({
      reply: reply || "Je n'ai pas pu générer de réponse."
    });
  } catch (error) {
    return res.status(error.status || 400).json({
      error: error.message || "Erreur serveur. Vérifie la configuration."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Chatbot lancé sur http://localhost:${PORT}`);
});
