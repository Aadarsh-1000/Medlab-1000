import { getDB } from "../api/_lib/db.js";

async function matchSymptoms(query) {

  const db = await getDB();

  // Find symptom IDs
  const symptomRows = await db.all(`
    SELECT *
    FROM symptoms
    WHERE name LIKE ?
    LIMIT 10
  `, [`%${query}%`]);

  console.log("Matched Symptoms:");
  console.log(symptomRows);

  if (symptomRows.length === 0) return;

  const symptomId = symptomRows[0].id;

  // Find diseases containing symptom
  const diseaseRows = await db.all(`
    SELECT *
    FROM disease_symptoms
    WHERE symptoms LIKE ?
    LIMIT 20
  `, [`%${symptomId}%`]);

  console.log("\nMatching Diseases:");
  console.log(diseaseRows);

}

matchSymptoms("urinary");