import { getDB } from "../api/_lib/db.js";

async function test() {

  const db = await getDB();

  const rows = await db.all(`
    SELECT name
    FROM sqlite_master
    WHERE type='table'
  `);

  console.log(rows);
}

test();