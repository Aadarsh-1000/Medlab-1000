import { getDB } from "../api/_lib/db.js";

async function rankDiseases(userSymptoms) {

  const db = await getDB();

  // Find matching HPO IDs
  const matchedSymptoms = [];

  for (const symptom of userSymptoms) {

    const rows = await db.all(`
      SELECT *
      FROM symptoms
      WHERE name LIKE ?
      LIMIT 5
    `, [`%${symptom}%`]);

    matchedSymptoms.push(...rows);
  }

  const hpoIds =
    matchedSymptoms.map(s => s.id);

  console.log("Matched HPO IDs:");
  console.log(hpoIds);

  // Retrieve diseases
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
        score
      });

    }
  }

  scored.sort((a, b) => b.score - a.score);

  console.log("\nTop Matches:");
  console.log(scored.slice(0, 10));
}

rankDiseases([
  "urinary",
  "retention"
]);