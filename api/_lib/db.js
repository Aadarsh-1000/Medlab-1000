import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import fs from "fs";

export async function getDB() {

  try {

    const dbPath = path.resolve(
      process.cwd(),
      "data",
      "combined_medical_database_optimized.db"
    );

    console.log("========== DB DEBUG ==========");
    console.log("CWD:", process.cwd());
    console.log("DB PATH:", dbPath);
    console.log("EXISTS:", fs.existsSync(dbPath));
    console.log("==============================");

    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    console.log("SQLITE CONNECTED");

    return db;

  } catch (err) {

    console.error("DB CONNECTION ERROR:");
    console.error(err);

    throw err;

  }

}