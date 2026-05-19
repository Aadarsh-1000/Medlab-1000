import dotenv from "dotenv";
dotenv.config();

import { getDB } from "./_lib/db.js";



/* =========================================
   SYMPTOM EXTRACTION
========================================= */

async function extractSymptoms(prompt) {

  try {

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
You are a medical symptom extractor.

Your ONLY task:
- extract medically relevant symptoms
- return ONLY valid JSON array

Rules:
- ignore greetings
- ignore filler words
- ignore normal conversation
- only include symptoms

Examples:

Input:
"I have headache and fever"

Output:
["headache","fever"]

Input:
"hello how are you"

Output:
[]
`
            },

            {
              role: "user",
              content: prompt
            }

          ],

          temperature: 0,
          max_tokens: 100

        })
      }
    );

    const data = await response.json();

    let content =
      data.choices?.[0]?.message?.content || "[]";

    // Clean markdown if model returns ```json
    content = content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(content);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    return [];

  } catch (error) {

    console.error("SYMPTOM EXTRACTION ERROR:");
    console.error(error);

    return [];

  }

}



/* =========================================
   RANK DISEASES
========================================= */

async function rankDiseases(userSymptoms) {

  const db = await getDB();

  console.log("DB CONNECTED");

  const matchedSymptoms = [];

  // Match symptoms from DB
  for (const symptom of userSymptoms) {

    const rows = await db.all(`
      SELECT *
      FROM symptoms
      WHERE LOWER(name) LIKE LOWER(?)
      LIMIT 10
    `, [`%${symptom}%`]);

    matchedSymptoms.push(...rows);

  }

  console.log("MATCHED SYMPTOMS:");
  console.log(matchedSymptoms);

  // Extract HPO IDs
  const hpoIds =
    [...new Set(
      matchedSymptoms.map(s => s.id)
    )];

  console.log("HPO IDS:");
  console.log(hpoIds);

  // Get disease mappings
  const diseases = await db.all(`
    SELECT *
    FROM disease_symptoms
  `);

  const scored = [];

  for (const disease of diseases) {

    let score = 0;

    // Convert CSV string into array
    const diseaseSymptoms =
      disease.symptoms
        ?.split(",")
        .map(s => s.trim()) || [];

    for (const hpo of hpoIds) {

      if (diseaseSymptoms.includes(hpo)) {
        score++;
      }

    }

    // Require stronger evidence
    if (score >= Math.min(2, userSymptoms.length)) {

      scored.push({
        disease: disease.id,
        score
      });

    }

  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 5);

}



/* =========================================
   WEB SEARCH
========================================= */

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

          max_results: 5

        })
      }
    );

    const data = await response.json();

    return data.results || [];

  } catch (error) {

    console.error("TAVILY ERROR:");
    console.error(error);

    return [];

  }

}



/* =========================================
   NORMAL CHAT
========================================= */

async function normalChat(prompt) {

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

            content:
              "You are a friendly medical AI assistant."
          },

          {
            role: "user",
            content: prompt
          }

        ],

        temperature: 0.7

      })
    }
  );

  const data = await response.json();

  return (
    data.choices?.[0]?.message?.content
    || "No response generated"
  );

}



/* =========================================
   MAIN HANDLER
========================================= */

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



    /* =========================================
       STEP 1 — EXTRACT SYMPTOMS
    ========================================= */

    const userSymptoms =
      await extractSymptoms(prompt);

    console.log("USER PROMPT:");
    console.log(prompt);

    console.log("EXTRACTED SYMPTOMS:");
    console.log(userSymptoms);



    /* =========================================
       STEP 2 — NORMAL CHAT FALLBACK
    ========================================= */

    if (userSymptoms.length === 0) {

      console.log("NO SYMPTOMS FOUND");
      console.log("SWITCHING TO NORMAL CHAT");

      const chatResponse =
        await normalChat(prompt);

      return res.status(200).json({

        mode: "chat",

        extractedSymptoms: [],

        response: chatResponse

      });

    }



    /* =========================================
       STEP 3 — RANK DISEASES
    ========================================= */

    const rankedDiseases =
      await rankDiseases(userSymptoms);

    console.log("RANKED DISEASES:");
    console.log(rankedDiseases);



    /* =========================================
       STEP 4 — WEB SEARCH
    ========================================= */

    const searchQuery =
      `${userSymptoms.join(", ")} symptoms treatment prognosis`;

    const webResults =
      await searchMedical(searchQuery);

    console.log("WEB RESULTS:");
    console.log(JSON.stringify(webResults, null, 2));



    /* =========================================
       STEP 5 — BUILD CONTEXT
    ========================================= */

    const context = `
USER QUERY:
${prompt}

EXTRACTED SYMPTOMS:
${JSON.stringify(userSymptoms, null, 2)}

TOP DISEASE MATCHES:
${JSON.stringify(rankedDiseases, null, 2)}

WEB SEARCH RESULTS:
${webResults.map(r => `
Title: ${r.title}

Content:
${r.content?.slice(0, 500)}

URL:
${r.url}
`).join("\n")}
`;



    /* =========================================
       STEP 6 — FINAL MEDICAL AI RESPONSE
    ========================================= */

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
- extracted symptoms
- disease ranking
- medical web evidence

Your job:
- summarize possible conditions
- explain possible causes
- explain symptom relevance
- provide safe medical guidance
- recommend professional medical care

Rules:
- NEVER claim certainty
- NEVER provide definitive diagnosis
- NEVER pretend to be a doctor
- explain uncertainty clearly

Use:
- bullet points
- readable formatting
- concise explanations
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

      console.error(data);

      return res.status(response.status).json({

        message:
          data.error?.message ||
          "Groq API Error"

      });

    }



    const reply =
      data.choices?.[0]?.message?.content
      || "No response generated";



    console.log("FINAL AI RESPONSE:");
    console.log(reply);



    /* =========================================
       FINAL RESPONSE
    ========================================= */

    return res.status(200).json({

      mode: "medical",

      extractedSymptoms: userSymptoms,

      rankedDiseases,

      webResults,

      response: reply,

      sources: webResults.map(r => ({

        title: r.title,

        url: r.url

      }))

    });

  } catch (error) {

    console.error("SERVER ERROR:");
    console.error(error);

    return res.status(500).json({
      message: error.message
    });

  }

}