import dotenv from "dotenv";
dotenv.config();

import { getDB } from "./_lib/db.js";

async function rankDiseases(userSymptoms) {

  const db = await getDB();
  console.log("DB CONNECTED");

  const matchedSymptoms = [];

  // Match user text to HPO symptoms
  for (const symptom of userSymptoms) {

    const rows = await db.all(`
      SELECT *
      FROM symptoms
      WHERE name LIKE ?
      LIMIT 10
    `, [`%${symptom}%`]);

    matchedSymptoms.push(...rows);

  }

  const hpoIds =
    matchedSymptoms.map(s => s.id);

  // Get all disease mappings
  const diseases = await db.all(`
    SELECT *
    FROM disease_symptoms
  `);

  const scored = [];

  for (const disease of diseases) {

    let score = 0;

    for (const hpo of hpoIds) {

      if (disease.symptoms.includes(hpo)) {
        score++;
      }

    }

    if (score > 0) {

      scored.push({
        disease: disease.id,
        score,
      });

    }

  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 5);

}

async function searchMedical(query) {

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
        max_results: 5,
      }),
    }
  );

  const data = await response.json();

  return data.results || [];

}

export default async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({
      message: "Method not allowed"
    });

  }

  try {

    const { prompt } = req.body;

    if (!prompt) {

      return res.status(400).json({
        message: "Prompt is required"
      });

    }

    // Convert user text into symptom tokens
    const userSymptoms =
      prompt
        .toLowerCase()
        .split(/[, ]+/)
        .filter(Boolean);

    // Rank diseases
    const rankedDiseases =
      await rankDiseases(userSymptoms);

    // Search web evidence
    const webResults = [];

    for (const disease of rankedDiseases) {

      const results =
        await searchMedical(
          `${disease.disease} symptoms treatment prognosis`
        );

      webResults.push({
        disease: disease.disease,
        results,
      });

    }

    // Build AI context
    const context = `
USER QUERY:
${prompt}

TOP DISEASE MATCHES:
${JSON.stringify(rankedDiseases, null, 2)}

MEDICAL SEARCH RESULTS:
${JSON.stringify(webResults, null, 2)}
`;

    // Send to Groq
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

You are given:
- user symptoms
- ranked disease matches
- live medical search evidence

Your job:
- summarize possible conditions
- explain why they may match
- explain common symptoms
- suggest medical follow-up

DO NOT claim certainty.
DO NOT provide definitive diagnosis.
Always recommend professional medical care.

Use clean formatting.
Use bullet points.
Keep responses readable.
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

    if (!response.ok) {

      return res.status(response.status).json({
        message:
          data.error?.message ||
          "Groq API Error"
      });

    }

    const reply =
      data.choices?.[0]?.message?.content ||
      "No response generated";

    res.status(200).json({

      response: reply,

      diseases: rankedDiseases,

      sources: webResults.flatMap(w =>
        w.results.map(r => ({
          title: r.title,
          url: r.url
        }))
      )

    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: error.message
    });

  }

}