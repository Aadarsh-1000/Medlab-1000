import { getDB } from "../api/_lib/db.js";

async function test() {

  const db = await getDB();

  const rows = await db.all(`
    SELECT *
    FROM symptoms
    LIMIT 20
  `);

  console.log(rows);
}

test();