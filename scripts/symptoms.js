import { getDB } from "../api/_lib/db.js";

async function test() {

  const db = await getDB();

  const rows = await db.all(`
    SELECT *
    FROM disease_symptoms
    LIMIT 10
  `);

  console.log(rows);
}

test();