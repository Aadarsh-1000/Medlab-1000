import sqlite3 from "sqlite3";
import { open } from "sqlite";

import path from "path";
import fs from "fs";
import os from "os";

export async function getDB() {

  // Original bundled DB
  const sourcePath = path.join(
    process.cwd(),
    "data",
    "combined_medical_database_optimized.db"
  );

  // Writable temp DB path for both Vercel Linux and local Windows runs.
  const tempPath = path.join(os.tmpdir(), "medical.db");

  console.log("SOURCE:", sourcePath);
  console.log("TMP:", tempPath);

  // Copy DB into writable temp storage
  if (!fs.existsSync(tempPath)) {

    fs.copyFileSync(sourcePath, tempPath);

    console.log("DB copied to temp storage");

  }

  // Open temp DB
  const db = await open({
    filename: tempPath,
    driver: sqlite3.Database,
  });

  console.log("SQLITE CONNECTED");

  return db;

}
