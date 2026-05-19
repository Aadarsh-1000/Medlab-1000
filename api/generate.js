import dotenv from "dotenv";
dotenv.config();

import { getDB } from "./_lib/db.js";

// =====================================================
// CONFIG
// =====================================================

const STOP_WORDS = [
  "hi",
  "hello",
  "hey",
  "what",
  "is",
  "the",
  "a",
  "an",
  "i",
  "have",
  "and",
  "or",
  "please",
  "help",
  "me",
  "can",
  "you",
  "tell",
  "about",
  "my",
  "am",
  "are",
  "was",
  "were",
  "do",
  "does",
  "did"
];

const MIN_SCORE = 2;

// =====================================================
// TOKENIZER
// =====================================================

function tokenizeSymptoms(text = "") {

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(word =>
      word &&
      !STOP_WORDS.includes(word) &&
      word.length > 2
    );

}

// =====================================================
// RANK DISEASES
// =====================================================

async function rankDiseases(userSymptoms) {

  const db = await getDB();

  console.log("DB CONNECTED");

  const matchedSymptoms = [];

  // -------------------------------------------------
  // FIND MATCHING HPO TERMS
  // -------------------------------------------------

  for (const symptom of userSymptoms) {

    try {

      const rows = await db.all(
        `
        SELECT *
        FROM symptoms
        WHERE LOWER(name) LIKE ?
        LIMIT 10
        `,
        [`%${symptom.toLowerCase()}%`]
      );

      if (rows?.length) {
        matchedSymptoms.push(...rows);
      }

    } catch (err) {

      console.error(
        "Symptom lookup failed:",
        symptom,
        err.message
      );

    }

  }

  // -------------------------------------------------
  // UNIQUE HPO IDS
  // -------------------------------------------------

  const hpoIds = [
    ...new Set(
      matchedSymptoms
        .map(s => s.id)
        .filter(Boolean)
    )
  ];

  // -------------------------------------------------
  // NO MATCHES
  // -------------------------------------------------

  if (hpoIds.length === 0) {
    return [];
  }

  // -------------------------------------------------
  // LOAD DISEASES
  // -------------------------------------------------

  const diseases = await db.all(`
    SELECT *
    FROM disease_symptoms
  `);

  const scored = [];

  // -------------------------------------------------
  // SCORE DISEASES
  // -------------------------------------------------

  for (const disease of diseases) {

    try {

      let diseaseSymptoms =
        disease.symptoms;

      // Convert JSON string to array
      if (typeof diseaseSymptoms === "string") {

        try {

          diseaseSymptoms =
            JSON.parse(diseaseSymptoms);

        } catch {

          diseaseSymptoms = [];

        }

      }

      if (!Array.isArray(diseaseSymptoms)) {
        diseaseSymptoms = [];
      }

      let score = 0;

      for (const hpo of hpoIds) {

        if (
          diseaseSymptoms.includes(hpo)
        ) {

          score++;

        }

      }

      if (score > 0) {

        scored.push({

          disease: disease.id,

          score,

          matchedSymptoms: score

        });

      }

    } catch (err) {

      console.error(
        "Disease scoring failed:",
        disease?.id,
        err.message
      );

    }

  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 5);

}

// =====================================================
// SEARCH MEDICAL WEB
// =====================================================

async function searchMedical(query) {

  try {

    const response = await fetch(
      "https://api.tavily.com/search",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({

          api_key:
            process.env.TAVILY_API_KEY,

          query,

          search_depth: "advanced",

          max_results: 2

        })

      }
    );

    const data =
      await response.json();

    return data.results || [];

  } catch (error) {

    console.error(
      "Medical search failed:",
      error.message
    );

    return [];

  }

}

// =====================================================
// STREAM HELPERS
// =====================================================

function sendStream(res, payload) {

  res.write(
    JSON.stringify(payload) + "\n"
  );

}

function sendStatus(res, message) {

  sendStream(res, {
    type: "status",
    message
  });

}

function sendFinal(res, data) {

  sendStream(res, {
    type: "final",
    ...data
  });

  res.end();

}

// =====================================================
// MAIN HANDLER
// =====================================================

export default async function handler(req, res) {

  // -------------------------------------------------
  // METHOD CHECK
  // -------------------------------------------------

  if (req.method !== "POST") {

    return res.status(405).json({
      message: "Method not allowed"
    });

  }

  // -------------------------------------------------
  // ENABLE STREAMING
  // -------------------------------------------------

  res.writeHead(200, {

    "Content-Type":
      "text/plain; charset=utf-8",

    "Transfer-Encoding":
      "chunked",

    "Cache-Control":
      "no-cache, no-transform",

    Connection: "keep-alive",

  });

  try {

    // -------------------------------------------------
    // VALIDATE INPUT
    // -------------------------------------------------

    const { prompt } = req.body || {};

    if (
      !prompt ||
      typeof prompt !== "string"
    ) {

      return sendFinal(res, {

        response:
          "Prompt is required",

        isMedicalContext: false,

        diseases: [],

        detectedSymptoms: [],

        sources: []

      });

    }

    // -------------------------------------------------
    // STEP 1
    // -------------------------------------------------

    sendStatus(
      res,
      "🧠 Processing user query"
    );

    const userSymptoms =
      tokenizeSymptoms(prompt);

    console.log(
      "TOKENS:",
      userSymptoms
    );

    // -------------------------------------------------
    // NO TOKENS
    // -------------------------------------------------

    if (userSymptoms.length === 0) {

      return sendFinal(res, {

        response:
          "Hello 👋 How can I help you today?",

        isMedicalContext: false,

        diseases: [],

        detectedSymptoms: [],

        sources: []

      });

    }

    // -------------------------------------------------
    // STEP 2
    // -------------------------------------------------

    sendStatus(
      res,
      "📂 Searching medical database"
    );

    const rankedDiseases =
      await rankDiseases(
        userSymptoms
      );

    console.log(
      "RANKED:",
      rankedDiseases
    );

    // -------------------------------------------------
    // STEP 3
    // -------------------------------------------------

    sendStatus(
      res,
      "✅ Medical database analyzed"
    );

    const filteredDiseases =
      rankedDiseases.filter(
        d => d.score >= MIN_SCORE
      );

    // -------------------------------------------------
    // NO MATCHES
    // -------------------------------------------------

    if (
      filteredDiseases.length === 0
    ) {

      sendStatus(
        res,
        "🤖 Sending query to AI assistant"
      );

      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {

          method: "POST",

          headers: {

            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${process.env.GROQ_API_KEY}`

          },

          body: JSON.stringify({

            model:
              "llama-3.1-8b-instant",

            messages: [

              {

                role: "system",

                content: `
You are MEDLAB AI.

The input does not contain
clear medical symptoms.

Respond conversationally.

DO NOT invent diseases.
`

              },

              {

                role: "user",

                content: prompt

              }

            ],

            temperature: 0.5,

            max_tokens: 500

          })

        }
      );

      sendStatus(
        res,
        "✨ AI generating response"
      );

      const data =
        await response.json();

      const reply =
        data?.choices?.[0]?.message
          ?.content ||
        "How can I help you?";

      return sendFinal(res, {

        response: reply,

        isMedicalContext: false,

        diseases: [],

        detectedSymptoms: [],

        sources: []

      });

    }

    // -------------------------------------------------
    // STEP 4
    // -------------------------------------------------

    sendStatus(
      res,
      "🌐 Searching medical evidence"
    );

    const webResults = [];

    for (const disease of filteredDiseases) {

      try {

        const results =
          await searchMedical(
            `${disease.disease} symptoms treatment prognosis`
          );

        webResults.push({
          disease:
            disease.disease,

          results
        });

      } catch (err) {

        console.error(
          "Search failed:",
          disease.disease
        );

      }

    }

    // -------------------------------------------------
    // STEP 5
    // -------------------------------------------------

    sendStatus(
      res,
      "🤖 Sending context to AI model"
    );

    const context = `
USER QUERY:
${prompt}

DETECTED SYMPTOMS:
${JSON.stringify(
  userSymptoms,
  null,
  2
)}

TOP MATCHES:
${JSON.stringify(
  filteredDiseases,
  null,
  2
)}

WEB EVIDENCE:

${webResults.map(w => `

Disease:
${w.disease}

${w.results.map(r => `

Title:
${r.title}

Content:
${r.content?.slice(0, 300)}

URL:
${r.url}

`).join("\n")}

`).join("\n")}
`;

    // -------------------------------------------------
    // GROQ REQUEST
    // -------------------------------------------------

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${process.env.GROQ_API_KEY}`

        },

        body: JSON.stringify({

          model:
            "llama-3.1-8b-instant",

          messages: [

            {

              role: "system",

              content: `
You are MEDLAB AI.

You are a professional
medical AI assistant.

You are provided:
- symptoms
- disease matches
- live medical evidence

Your job:
- explain possible conditions
- summarize symptom overlap
- provide safe guidance
- recommend follow-up

IMPORTANT:
- NEVER diagnose
- NEVER claim certainty
- NEVER invent diseases
- ALWAYS recommend
  professional care

Use:
- bullet points
- clean formatting
- readable structure
`

            },

            {

              role: "user",

              content: context

            }

          ],

          temperature: 0.4,

          max_tokens: 1500

        })

      }
    );

    // -------------------------------------------------
    // STEP 6
    // -------------------------------------------------

    sendStatus(
      res,
      "✨ AI generating response"
    );

    const data =
      await response.json();

    if (!response.ok) {

      console.error(
        "GROQ ERROR:",
        data
      );

      return sendFinal(res, {

        response:
          data?.error?.message ||
          "Groq API Error",

        isMedicalContext: false,

        diseases: [],

        detectedSymptoms: [],

        sources: []

      });

    }

    const reply =
      data?.choices?.[0]?.message
        ?.content ||
      "No response generated";

    // -------------------------------------------------
    // FINAL RESPONSE
    // -------------------------------------------------

    return sendFinal(res, {

      response: reply,

      isMedicalContext: true,

      detectedSymptoms:
        userSymptoms,

      diseases:
        filteredDiseases,

      sources:
        webResults.flatMap(w =>
          w.results.map(r => ({

            title: r.title,

            url: r.url

          }))
        )

    });

  } catch (error) {

    console.error(
      "SERVER ERROR:",
      error
    );

    return sendFinal(res, {

      response:
        error.message ||
        "Internal server error",

      isMedicalContext: false,

      diseases: [],

      detectedSymptoms: [],

      sources: []

    });

  }

}