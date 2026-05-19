import dotenv from "dotenv";
dotenv.config();

import { getDB } from "./_lib/db.js";

// ---------------------------------------------------
// CONFIG
// ---------------------------------------------------

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

// ---------------------------------------------------
// TOKENIZER
// ---------------------------------------------------

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

// ---------------------------------------------------
// DISEASE RANKER
// ---------------------------------------------------

async function rankDiseases(userSymptoms) {

  const db = await getDB();

  console.log("DB CONNECTED");

  const matchedSymptoms = [];

  // -------------------------------------------
  // FIND MATCHING HPO TERMS
  // -------------------------------------------

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

  // -------------------------------------------
  // REMOVE DUPLICATE HPO IDs
  // -------------------------------------------

  const hpoIds = [
    ...new Set(
      matchedSymptoms
        .map(s => s.id)
        .filter(Boolean)
    )
  ];

  // -------------------------------------------
  // NO MATCHES FOUND
  // -------------------------------------------

  if (hpoIds.length === 0) {
    return [];
  }

  // -------------------------------------------
  // LOAD DISEASES
  // -------------------------------------------

  const diseases = await db.all(`
    SELECT *
    FROM disease_symptoms
  `);

  const scored = [];

  // -------------------------------------------
  // SCORE DISEASES
  // -------------------------------------------

  for (const disease of diseases) {

    try {

      let diseaseSymptoms = disease.symptoms;

      // Convert JSON string -> array if needed
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

        if (diseaseSymptoms.includes(hpo)) {
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

  // -------------------------------------------
  // SORT BEST MATCHES
  // -------------------------------------------

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 5);

}

// ---------------------------------------------------
// SEARCH MEDICAL EVIDENCE
// ---------------------------------------------------

async function searchMedical(query) {

  try {

    const response = await fetch(
      "https://api.tavily.com/search",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query,
          search_depth: "advanced",
          max_results: 2,
        }),
      }
    );

    const data = await response.json();

    return data.results || [];

  } catch (error) {

    console.error(
      "Medical search failed:",
      error.message
    );

    return [];

  }

}

// ---------------------------------------------------
// MAIN API HANDLER
// ---------------------------------------------------

export default async function handler(req, res) {

  // -------------------------------------------
  // METHOD VALIDATION
  // -------------------------------------------

  if (req.method !== "POST") {

    return res.status(405).json({
      message: "Method not allowed"
    });

  }

  try {

    // -------------------------------------------
    // REQUEST VALIDATION
    // -------------------------------------------

    const { prompt } = req.body || {};

    if (
      !prompt ||
      typeof prompt !== "string"
    ) {

      return res.status(400).json({
        message: "Prompt is required"
      });

    }

    // -------------------------------------------
    // TOKENIZE INPUT
    // -------------------------------------------

    const userSymptoms =
      tokenizeSymptoms(prompt);

    console.log(
      "DETECTED TOKENS:",
      userSymptoms
    );

    // -------------------------------------------
    // EARLY EXIT FOR NORMAL CHAT
    // -------------------------------------------

    if (userSymptoms.length === 0) {

      return res.status(200).json({

        response:
          "Hello 👋 How can I help you today?",

        isMedicalContext: false,

        detectedSymptoms: [],

        diseases: [],

        sources: []

      });

    }

    // -------------------------------------------
    // RANK DISEASES
    // -------------------------------------------

    const rankedDiseases =
      await rankDiseases(userSymptoms);

    console.log(
      "RANKED DISEASES:",
      rankedDiseases
    );

    // -------------------------------------------
    // FILTER LOW CONFIDENCE
    // -------------------------------------------

    const filteredDiseases =
      rankedDiseases.filter(
        disease =>
          disease.score >= MIN_SCORE
      );

    const hasSymptomsDetected =
      filteredDiseases.length > 0;

    // -------------------------------------------
    // NON-MEDICAL CHAT MODE
    // -------------------------------------------

    if (!hasSymptomsDetected) {

      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            "Authorization":
              `Bearer ${process.env.GROQ_API_KEY}`
          },

          body: JSON.stringify({

            model: "llama-3.1-8b-instant",

            messages: [

              {
                role: "system",

                content: `
You are MEDLAB AI.

The user input does not clearly contain medical symptoms.

Respond conversationally and helpfully.

DO NOT invent diseases.
DO NOT fabricate diagnoses.
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

      const data = await response.json();

      const reply =
        data?.choices?.[0]?.message?.content ||
        "How can I help you?";

      return res.status(200).json({

        response: reply,

        isMedicalContext: false,

        detectedSymptoms: [],

        diseases: [],

        sources: []

      });

    }

    // -------------------------------------------
    // SEARCH MEDICAL SOURCES
    // -------------------------------------------

    const webResults = [];

    for (const disease of filteredDiseases) {

      const results =
        await searchMedical(
          `${disease.disease} symptoms treatment prognosis`
        );

      webResults.push({
        disease: disease.disease,
        results,
      });

    }

    // -------------------------------------------
    // BUILD AI CONTEXT
    // -------------------------------------------

    const context = `
USER QUERY:
${prompt}

DETECTED SYMPTOMS:
${JSON.stringify(userSymptoms, null, 2)}

TOP DISEASE MATCHES:
${JSON.stringify(filteredDiseases, null, 2)}

MEDICAL SEARCH RESULTS:

${webResults.map(w => `

Disease: ${w.disease}

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

    // -------------------------------------------
    // SEND TO GROQ
    // -------------------------------------------

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization":
            `Bearer ${process.env.GROQ_API_KEY}`
        },

        body: JSON.stringify({

          model: "llama-3.1-8b-instant",

          messages: [

            {
              role: "system",

              content: `
You are MEDLAB AI.

You are a professional medical AI assistant.

You are provided:
- user symptoms
- ranked disease matches
- medical search evidence

Your job:
- explain possible conditions
- summarize symptom overlap
- explain possible causes
- provide safe guidance
- suggest medical follow-up

IMPORTANT:
- NEVER provide diagnosis
- NEVER claim certainty
- NEVER invent conditions
- ALWAYS recommend medical care
- Keep formatting clean
- Use bullet points
- Be concise and readable
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

    const data = await response.json();

    // -------------------------------------------
    // HANDLE GROQ ERRORS
    // -------------------------------------------

    if (!response.ok) {

      console.error(
        "Groq API Error:",
        data
      );

      return res.status(response.status).json({
        message:
          data?.error?.message ||
          "Groq API Error"
      });

    }

    const reply =
      data?.choices?.[0]?.message?.content ||
      "No response generated";

    // -------------------------------------------
    // FINAL RESPONSE
    // -------------------------------------------

    return res.status(200).json({

      response: reply,

      isMedicalContext: true,

      detectedSymptoms: userSymptoms,

      diseases: filteredDiseases,

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

    return res.status(500).json({
      message:
        error.message ||
        "Internal server error"
    });

  }

}