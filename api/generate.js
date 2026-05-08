import { getSession } from "./_lib/auth.js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
    res.status(405).json({ message: "POST only" });
    return;
  }

  const user = getSession(req);
  if (!user) {
    res.status(401).json({ message: "Please sign in from the homepage first." });
    return;
  }

  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) {
    res.status(400).json({ message: "Prompt is required." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  console.log("ENV TEST:", process.env.GEMINI_API_KEY);
console.log("API EXISTS:", !!apiKey);
  if (!apiKey) {
    res.status(200).json({
      response: buildFallbackResponse(prompt),
    });
    return;
  }

  try {
  const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are MEDLAB's medical information assistant. Give concise, careful, non-diagnostic health information and encourage seeking professional care when appropriate.\n\nUser: ${prompt}`,
              },
            ],
          },
        ],
      }),
    }
  );

  const data = await response.json();

  console.log("GEMINI RESPONSE:", data);

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "Gemini request failed."
    );
  }

  const content =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  res.status(200).json({
    response: content || "AI returned an empty response.",
  });
} catch (error) {
  console.error("Generate error:", error);

  res.status(500).json({
    message:
      error.message || "Unable to generate a response right now.",
  });
}
}

function buildFallbackResponse(prompt) {
  const text = prompt.toLowerCase();

  const emergencySignals = [
    "chest pain",
    "shortness of breath",
    "difficulty breathing",
    "fainted",
    "passed out",
    "stroke",
    "seizure",
    "suicidal",
    "severe bleeding",
  ];

  if (emergencySignals.some((signal) => text.includes(signal))) {
    return "This could be urgent. Please seek immediate medical help or emergency care right away. MEDLAB guest fallback mode cannot safely assess emergency symptoms.";
  }

  const symptomHints = [];
  if (text.includes("fever")) symptomHints.push("infection or inflammation");
  if (text.includes("cough")) symptomHints.push("a respiratory illness");
  if (text.includes("headache")) symptomHints.push("dehydration, stress, migraine, or infection");
  if (text.includes("rash")) symptomHints.push("an allergic, inflammatory, or infectious skin issue");
  if (text.includes("stomach") || text.includes("abdominal")) symptomHints.push("a digestive issue");
  if (text.includes("vomit") || text.includes("nausea")) symptomHints.push("a stomach bug, food-related illness, or dehydration");
  if (text.includes("sore throat")) symptomHints.push("a viral or bacterial throat infection");
  if (text.includes("fatigue")) symptomHints.push("illness, poor sleep, stress, or dehydration");

  if (symptomHints.length > 0) {
    return `Guest fallback mode: your symptoms may fit ${symptomHints.join(", ")}. Track how long they last, stay hydrated, rest, and seek medical care if symptoms are severe, worsening, or not improving.`;
  }

  return "Guest fallback mode is active. I can still give basic health guidance, but richer AI answers need an AI provider key. Please describe symptoms, duration, age group, and anything making them better or worse.";
}
