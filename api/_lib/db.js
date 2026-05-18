import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import fs from "fs";

export async function getDB() {

  const dbPath = path.join(
    process.cwd(),
    "public",
    "combined_medical_database_optimized.db"
  );

  console.log("DB PATH:", dbPath);

  console.log(
    "DB EXISTS:",
    fs.existsSync(dbPath)
  );

  return open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

}