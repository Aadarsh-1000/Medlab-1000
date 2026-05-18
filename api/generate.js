import dotenv from "dotenv";
dotenv.config();

import { getDB } from "./_lib/db.js";

/* =================================
   LOGGER
================================= */

function logStep(title, data = null) {

  console.log("\n=================================");
  console.log(`STEP: ${title}`);
  console.log("=================================");

  if (data !== null) {

    console.log(
      typeof data === "string"
        ? data
        : JSON.stringify(data, null, 2)
    );

  }

}

/* =================================
   SYMPTOM EXTRACTION
================================= */

function extractSymptoms(text) {

  const knownSymptoms = [

    "sore throat",
    "fever",
    "headache",
    "cough",
    "fatigue",
    "chest pain",
    "shortness of breath",
    "urinary retention",
    "blurred vision",
    "nausea",
    "vomiting",
    "diarrhea",
    "dizziness",
    "body pain",
    "runny nose",
    "congestion",
    "abdominal pain",
    "loss of taste",
    "loss of smell"

  ];

  const lower =
    text.toLowerCase();

  const matches =
    knownSymptoms.filter(symptom =>
      lower.includes(symptom)
    );

  // fallback
  if (matches.length === 0) {

    return lower
      .split(/[,]+/)
      .map(s => s.trim())
      .filter(Boolean);

  }

  return matches;

}

/* =================================
   FILTER RARE DISEASES
================================= */

function isRareDisease(diseaseName) {

  const bannedKeywords = [

    "syndrome",
    "deficiency",
    "chromosome",
    "mutation",
    "hereditary",
    "congenital",
    "deletion",
    "duplication",
    "dysplasia"

  ];

  const lower =
    diseaseName.toLowerCase();

  return bannedKeywords.some(keyword =>
    lower.includes(keyword)
  );

}

/* =================================
   COMMON DISEASE BOOST
================================= */

const commonDiseaseBoost = {

  "Common Cold": 10,
  "Influenza": 9,
  "Flu": 9,
  "COVID-19": 9,
  "Strep Throat": 10,
  "Pharyngitis": 8,
  "Tonsillitis": 8,
  "Bronchitis": 7,
  "Migraine": 7,
  "Gastroenteritis": 7,
  "Diabetes": 6

};

/* =================================
   DISEASE RANKER
================================= */

async function rankDiseases(userSymptoms) {

  logStep(
    "DISEASE RANKING STARTED",
    userSymptoms
  );

  const db = await getDB();

  logStep("DATABASE CONNECTED");

  const matchedSymptoms = [];

  for (const symptom of userSymptoms) {

    const sql = `
      SELECT *
      FROM symptoms
      WHERE name LIKE ?
      LIMIT 10
    `;

    const parameter =
      `%${symptom}%`;

    logStep(
      "QUERY SENT TO DB",
      {
        symptom,
        sql,
        parameter
      }
    );

    const rows =
      await db.all(sql, [parameter]);

    logStep(
      "DB RESPONSE RECEIVED",
      rows
    );

    matchedSymptoms.push(...rows);

  }

  const hpoIds =
    matchedSymptoms.map(s => s.id);

  logStep(
    "MATCHED HPO IDS",
    hpoIds
  );

  const diseases =
    await db.all(`
      SELECT *
      FROM disease_symptoms
    `);

  logStep(
    "ALL DISEASES RETRIEVED",
    {
      total: diseases.length
    }
  );

  const scored = [];

  for (const disease of diseases) {

    if (
      isRareDisease(disease.id)
    ) {
      continue;
    }

    let score = 0;
    let matches = 0;

    for (const hpo of hpoIds) {

      if (
        disease.symptoms.includes(hpo)
      ) {

        matches++;

        score += 2;

      }

    }

    // normalize score
    const diseaseSymptomCount =
      disease.symptoms.split(",").length || 1;

    const normalizedScore =
      score / diseaseSymptomCount;

    // common disease boost
    const boost =
      commonDiseaseBoost[disease.id] || 0;

    const finalScore =
      normalizedScore + boost;

    // confidence threshold
    if (matches >= 1) {

      scored.push({

        disease: disease.id,

        score: Number(
          finalScore.toFixed(2)
        ),

        matchedSymptoms: matches

      });

    }

  }

  scored.sort(
    (a, b) => b.score - a.score
  );

  logStep(
    "DISEASE RANKING COMPLETE",
    scored.slice(0, 10)
  );

  return scored.slice(0, 5);

}

/* =================================
   WEB SEARCH
================================= */

async function searchMedical(query) {

  logStep(
    "WEB SEARCH STARTED",
    query
  );

  const response = await fetch(
    "https://api.tavily.com/search",
    {

      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({

        api_key:
          process.env.TAVILY_API_KEY,

        query,

        search_depth: "advanced",

        max_results: 2,

      }),

    }
  );

  const data =
    await response.json();

  logStep(
    "WEB SEARCH RESPONSE RECEIVED",
    data
  );

  return data.results || [];

}

/* =================================
   MAIN API
================================= */

export default async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({
      message: "Method not allowed"
    });

  }

  try {

    logStep(
      "NEW REQUEST RECEIVED"
    );

    const { prompt } = req.body;

    logStep(
      "USER PROMPT RECEIVED",
      prompt
    );

    if (!prompt) {

      return res.status(400).json({
        message: "Prompt is required"
      });

    }

    /* =============================
       EXTRACT SYMPTOMS
    ============================= */

    const userSymptoms =
      extractSymptoms(prompt);

    logStep(
      "SYMPTOMS EXTRACTED",
      userSymptoms
    );

    /* =============================
       RANK DISEASES
    ============================= */

    const rankedDiseases =
      await rankDiseases(
        userSymptoms
      );

    logStep(
      "TOP DISEASES FOUND",
      rankedDiseases
    );

    /* =============================
       WEB SEARCH
    ============================= */

    const webResults = [];

    for (const disease of rankedDiseases) {

      const searchQuery =
        `${disease.disease} symptoms treatment prognosis`;

      const results =
        await searchMedical(
          searchQuery
        );

      webResults.push({

        disease:
          disease.disease,

        results,

      });

    }

    logStep(
      "ALL WEB SEARCHES COMPLETE",
      webResults
    );

    /* =============================
       BUILD LLM CONTEXT
    ============================= */

    const context = `

USER QUERY:
${prompt}

EXTRACTED SYMPTOMS:
${JSON.stringify(userSymptoms, null, 2)}

TOP DISEASE MATCHES:
${JSON.stringify(rankedDiseases, null, 2)}

MEDICAL SEARCH RESULTS:
${webResults.map(w => `

Disease: ${w.disease}

${w.results.map(r => `

Title: ${r.title}

Content:
${r.content?.slice(0, 500)}

URL:
${r.url}

`).join("\n")}

`).join("\n")}

`;

    logStep(
      "FINAL CONTEXT SENT TO LLM",
      context
    );

    /* =============================
       SEND TO GROQ
    ============================= */

    logStep(
      "LLM REQUEST STARTED"
    );

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/json",

          "Authorization":
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

You are a professional medical AI assistant.

You are given:
- user symptoms
- ranked disease matches
- live medical search evidence

Your job:
- summarize likely conditions
- explain why they may match
- explain common symptoms
- suggest medical follow-up

IMPORTANT RULES:
- prioritize common illnesses first
- rare diseases should ONLY appear if confidence is high
- NEVER claim certainty
- NEVER provide definitive diagnosis
- ALWAYS recommend professional medical care
- use clean formatting
- use bullet points
- keep answers readable

`

            },

            {

              role: "user",

              content: context

            }

          ],

          temperature: 0.3,

          max_tokens: 1500

        })

      }
    );

    const data =
      await response.json();

    logStep(
      "LLM RESPONSE RECEIVED",
      data
    );

    if (!response.ok) {

      return res.status(
        response.status
      ).json({

        message:
          data.error?.message ||
          "Groq API Error"

      });

    }

    const reply =
      data.choices?.[0]?.message?.content ||
      "No response generated";

    logStep(
      "FINAL RESPONSE GENERATED",
      reply
    );

    /* =============================
       SEND RESPONSE
    ============================= */

    res.status(200).json({

      response: reply,

      diseases: rankedDiseases,

      sources:
        webResults.flatMap(w =>
          w.results.map(r => ({

            title: r.title,
            url: r.url

          }))
        )

    });

  } catch (error) {

    console.error("\n=================================");
    console.error("FATAL ERROR");
    console.error("=================================\n");

    console.error(error);

    res.status(500).json({
      message: error.message
    });

  }

}