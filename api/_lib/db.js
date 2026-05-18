import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";

export async function getDB() {

  return open({

    filename: path.join(
      process.cwd(),
      "combined_medical_database_optimized.db"
    ),

    driver: sqlite3.Database,

  });

}