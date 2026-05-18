import { getDB } from "../api/_lib/db.js";

async function search() {

  const db = await getDB();

  const rows = await db.all(`
    SELECT *
    FROM disease_names
    LIMIT 5
  `);

  console.log(rows);
}

search();