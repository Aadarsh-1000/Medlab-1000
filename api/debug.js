import fs from "fs";
import path from "path";

export default async function handler(req, res) {

  const root = process.cwd();

  const dataPath = path.join(
    root,
    "data"
  );

  const dbPath = path.join(
    dataPath,
    "combined_medical_database_optimized.db"
  );

  res.status(200).json({

    cwd: root,

    dataExists: fs.existsSync(dataPath),

    dbExists: fs.existsSync(dbPath),

    filesInRoot: fs.readdirSync(root),

    filesInData:
      fs.existsSync(dataPath)
        ? fs.readdirSync(dataPath)
        : [],

    dbPath

  });

}