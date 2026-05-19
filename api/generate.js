import dotenv from "dotenv";
dotenv.config();

import { getDB } from "./_lib/db.js";

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "been",
  "being",
  "could",
  "does",
  "doing",
  "from",
  "have",
  "hello",
  "help",
  "here",
  "just",
  "like",
  "more",
  "need",
  "only",
  "please",
  "should",
  "some",
  "that",
  "their",
  "there",
  "they",
  "this",
  "what",
  "when",
  "where",
  "with",
  "would",
  "your",
]);

function wantsStream(req) {
  return req.headers.accept?.includes("text/event-stream");
}

function createProgress(req, res) {
  if (!wantsStream(req)) {
    const events = [];
    return {
      enabled: false,
      events,
      send(event, text, details = {}) {
        events.push({ event, text, details, at: new Date().toISOString() });
      },
    };
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
  });

  return {
    enabled: true,
    send(event, text, details = {}) {
      res.write(`event: progress\n`);
      res.write(`data: ${JSON.stringify({
        event,
        text,
        details,
        at: new Date().toISOString(),
      })}\n\n`);
    },
    final(data) {
      res.write(`event: final\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      res.end();
    },
    error(message) {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message })}\n\n`);
      res.end();
    },
  };
}

function extractSymptomTerms(prompt) {
  return [
    ...new Set(
      prompt
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map(term => term.trim())
        .filter(term => term.length >= 3 && !STOP_WORDS.has(term))
    ),
  ].slice(0, 20);
}

function symptomNameMatchesTerm(name, term) {
  return new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i")
    .test(name);
}

async function rankDiseases(prompt) {
  const db = await getDB();
  const terms = extractSymptomTerms(prompt);
  const matchedById = new Map();

  for (const term of terms) {
    const rows = await db.all(`
      SELECT *
      FROM symptoms
      WHERE LOWER(name) LIKE ?
      LIMIT 10
    `, [`%${term}%`]);

    for (const row of rows) {
      if (symptomNameMatchesTerm(row.name, term)) {
        matchedById.set(row.id, row);
      }
    }
  }

  const matchedSymptoms = [...matchedById.values()];

  if (matchedSymptoms.length === 0) {
    return {
      terms,
      matchedSymptoms,
      rankedDiseases: [],
    };
  }

  const hpoIds = matchedSymptoms.map(symptom => symptom.id);
  const diseases = await db.all(`
    SELECT *
    FROM disease_symptoms
  `);

  const scored = [];

  for (const disease of diseases) {
    let score = 0;

    for (const hpo of hpoIds) {
      if (disease.symptoms?.includes(hpo)) {
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

  return {
    terms,
    matchedSymptoms,
    rankedDiseases: scored.slice(0, 5),
  };
}

async function searchMedical(query) {
  if (!process.env.TAVILY_API_KEY) {
    return [];
  }

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

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.results || [];
}

async function askGroq(messages) {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages,
        temperature: 0.4,
        max_tokens: 1500,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Groq API Error");
  }

  return data.choices?.[0]?.message?.content || "No response generated";
}

function buildMedicalMessages(prompt, rankedDiseases, matchedSymptoms, webResults) {
  const context = `
USER QUERY:
${prompt}

MATCHED DB SYMPTOMS:
${JSON.stringify(matchedSymptoms, null, 2)}

TOP DISEASE MATCHES FROM DB:
${JSON.stringify(rankedDiseases, null, 2)}

MEDICAL SEARCH RESULTS:
${webResults.map(w => `
Disease: ${w.disease}

${w.results.map(r => `
Title: ${r.title}
Content: ${r.content?.slice(0, 300)}
URL: ${r.url}
`).join("\n")}
`).join("\n")}
`;

  return [
    {
      role: "system",
      content: `
You are MEDLAB AI, a professional medical AI assistant.

You are given:
- the user's query
- matched symptoms from the medical database
- ranked disease matches from the medical database
- live medical search evidence when available

Your job:
- summarize possible conditions
- explain why they may match
- explain common symptoms
- suggest medical follow-up

DO NOT claim certainty.
DO NOT provide a definitive diagnosis.
Always recommend professional medical care for urgent, severe, or worrying symptoms.

Use clean formatting.
Use bullet points when helpful.
Keep responses readable.
`,
    },
    {
      role: "user",
      content: context,
    },
  ];
}

function buildNormalMessages(prompt) {
  return [
    {
      role: "system",
      content: `
You are MEDLAB AI.

When the user is not giving symptoms, chat naturally and answer their question directly.
You can discuss general wellness or medical education, but do not force a diagnosis flow.
If the user asks for medical advice, be helpful, cautious, and recommend professional care when appropriate.
Keep the tone friendly and concise.
`,
    },
    {
      role: "user",
      content: prompt,
    },
  ];
}

async function generateAnswer(prompt, progress) {
  progress.send("query_received", "User query received");

  progress.send("db_started", "Query sent to medical DB");
  const {
    matchedSymptoms,
    rankedDiseases,
  } = await rankDiseases(prompt);
  progress.send(
    "db_done",
    rankedDiseases.length > 0
      ? "Answer taken from medical DB"
      : "No symptom match found in medical DB",
    {
      matchedSymptoms: matchedSymptoms.length,
      rankedDiseases: rankedDiseases.length,
    }
  );

  let webResults = [];
  let messages;

  if (rankedDiseases.length > 0) {
    progress.send("search_started", "Sending DB matches to medical search");

    for (const disease of rankedDiseases) {
      const results = await searchMedical(
        `${disease.disease} symptoms treatment prognosis`
      );

      webResults.push({
        disease: disease.disease,
        results,
      });
    }

    progress.send("search_done", "Medical search results received", {
      sources: webResults.flatMap(w => w.results).length,
    });

    messages = buildMedicalMessages(prompt, rankedDiseases, matchedSymptoms, webResults);
  } else {
    messages = buildNormalMessages(prompt);
  }

  progress.send("llm_started", "Sending to LLM");
  const reply = await askGroq(messages);
  progress.send("llm_done", "Final answer ready");

  return {
    response: reply,
    mode: rankedDiseases.length > 0 ? "medical" : "normal",
    diseases: rankedDiseases,
    matchedSymptoms,
    sources: webResults.flatMap(w =>
      w.results.map(r => ({
        title: r.title,
        url: r.url,
      }))
    ),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      message: "Method not allowed",
    });
  }

  const progress = createProgress(req, res);

  try {
    const { prompt } = req.body;

    if (!prompt?.trim()) {
      if (progress.enabled) {
        return progress.error("Prompt is required");
      }

      return res.status(400).json({
        message: "Prompt is required",
      });
    }

    const result = await generateAnswer(prompt.trim(), progress);

    if (progress.enabled) {
      return progress.final(result);
    }

    return res.status(200).json({
      ...result,
      events: progress.events,
    });
  } catch (error) {
    console.error(error);

    if (progress.enabled) {
      return progress.error(error.message);
    }

    return res.status(500).json({
      message: error.message,
    });
  }
}
