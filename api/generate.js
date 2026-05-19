import dotenv from "dotenv";
dotenv.config();

import { getDB } from "./_lib/db.js";



/* =========================================
   SYMPTOM EXTRACTION
========================================= */

async function extractSymptoms(prompt, debug) {

  let content = "[]";

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
Extract ONLY medical symptoms.

Return ONLY a JSON array.

NO markdown.
NO explanation.
NO text outside JSON.

Examples:

Input:
"I have fever and cough"

Output:
["fever","cough"]

Input:
"hello"

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
    console.log("FULL API RESPONSE:");
console.log(data);

console.log("DEBUG PIPELINE:");
console.log(data.debug);

    debug.push({
      step: "RAW EXTRACTOR RESPONSE",
      data
    });

    content =
      data.choices?.[0]?.message?.content || "[]";

    content = content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    // safer parsing
    const match =
      content.match(/\[[\s\S]*\]/);

    if (!match) {

      debug.push({
        step: "NO JSON ARRAY FOUND",
        data: content
      });

      return [];

    }

    const parsed =
      JSON.parse(match[0]);

    if (!Array.isArray(parsed)) {
      return [];
    }

    debug.push({
      step: "EXTRACTED SYMPTOMS",
      data: parsed
    });

    return parsed;

  } catch (error) {

    debug.push({
      step: "SYMPTOM EXTRACTION ERROR",
      data: {
        error: error.message,
        rawContent: content
      }
    });

    return [];

  }

}



/* =========================================
   RANK DISEASES
========================================= */

async function rankDiseases(userSymptoms, debug) {

  const db = await getDB();

  const matchedSymptoms = [];

  for (const symptom of userSymptoms) {

    const rows = await db.all(`
      SELECT *
      FROM symptoms
      WHERE LOWER(name) LIKE LOWER(?)
      LIMIT 10
    `, [`%${symptom}%`]);

    matchedSymptoms.push(...rows);

  }

  debug.push({
    step: "MATCHED DB SYMPTOMS",
    data: matchedSymptoms
  });

  const hpoIds =
    [...new Set(
      matchedSymptoms.map(s => s.id)
    )];

  debug.push({
    step: "HPO IDS",
    data: hpoIds
  });

  const diseases = await db.all(`
    SELECT *
    FROM disease_symptoms
  `);

  const scored = [];

  for (const disease of diseases) {

    let score = 0;

    const diseaseSymptoms =
      disease.symptoms
        ?.split(",")
        .map(s => s.trim()) || [];

    for (const hpo of hpoIds) {

      if (diseaseSymptoms.includes(hpo)) {
        score++;
      }

    }

    // stronger filtering
    if (score >= Math.min(2, userSymptoms.length)) {

      scored.push({
        disease: disease.id,
        score
      });

    }

  }

  scored.sort((a, b) => b.score - a.score);

  const topDiseases =
    scored.slice(0, 5);

  debug.push({
    step: "RANKED DISEASES",
    data: topDiseases
  });

  return topDiseases;

}



/* =========================================
   WEB SEARCH
========================================= */

async function searchMedical(query, debug) {

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

    debug.push({
      step: "WEB SEARCH RESULTS",
      data: data.results || []
    });

    return data.results || [];

  } catch (error) {

    debug.push({
      step: "WEB SEARCH ERROR",
      data: error.message
    });

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

  const debug = [];

  try {

    if (req.method !== "POST") {

      return res.status(405).json({
        message: "Method not allowed"
      });

    }

    const { prompt } = req.body;

    if (!prompt) {

      return res.status(400).json({
        message: "Prompt is required"
      });

    }

    debug.push({
      step: "USER PROMPT",
      data: prompt
    });



    /* =========================================
       EXTRACT SYMPTOMS
    ========================================= */

    const userSymptoms =
      await extractSymptoms(prompt, debug);



    /* =========================================
       NORMAL CHAT FALLBACK
    ========================================= */

    if (userSymptoms.length === 0) {

      const chatResponse =
        await normalChat(prompt);

      debug.push({
        step: "MODE",
        data: "NORMAL CHAT"
      });

      return res.status(200).json({

        mode: "chat",

        extractedSymptoms: [],

        response: chatResponse,

        debug

      });

    }



    /* =========================================
       DISEASE RANKING
    ========================================= */

    const rankedDiseases =
      await rankDiseases(
        userSymptoms,
        debug
      );



    /* =========================================
       WEB SEARCH
    ========================================= */

    const searchQuery =
      `${userSymptoms.join(", ")} symptoms treatment prognosis`;

    const webResults =
      await searchMedical(
        searchQuery,
        debug
      );



    /* =========================================
       BUILD CONTEXT
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
       FINAL AI RESPONSE
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

Provide safe medical guidance.

NEVER diagnose with certainty.

Explain possible conditions clearly.

Use bullet points.
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

    const reply =
      data.choices?.[0]?.message?.content
      || "No response generated";

    debug.push({
      step: "FINAL AI RESPONSE",
      data: reply
    });



    /* =========================================
       FINAL RESPONSE
    ========================================= */

    return res.status(200).json({

      mode: "medical",

      extractedSymptoms: userSymptoms,

      rankedDiseases,

      webResults,

      response: reply,

      debug,

      sources: webResults.map(r => ({

        title: r.title,
        url: r.url

      }))

    });

  } catch (error) {

    debug.push({
      step: "SERVER ERROR",
      data: error.message
    });

    return res.status(500).json({

      message: error.message,

      debug

    });

  }

}