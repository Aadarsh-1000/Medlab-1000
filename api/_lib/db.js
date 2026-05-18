import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";

export async function getDB() {

  const dbPath = path.join(
    process.cwd(),
    "combined_medical_database_optimized.db"
  );

  console.log("DB PATH:", dbPath);

  return open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

}