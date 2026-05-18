import { collection } from "../api/_lib/vector.js";

async function ingest() {
  try {

    console.log("Starting ingestion...");

    await collection.add({
      ids: ["1"],
      documents: [
        "Diabetes symptoms include fatigue, frequent urination, thirst, blurred vision."
      ],
      metadatas: [
        {
          disease: "Diabetes"
        }
      ]
    });

    console.log("Ingestion complete!");

  } catch (err) {

    console.error("INGEST ERROR:");
    console.error(err);

  }
}

ingest();