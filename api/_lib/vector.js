import { ChromaClient } from "chromadb";

const client = new ChromaClient({
  path: "http://localhost:8000"
});

export const collection =
  await client.getOrCreateCollection({
    name: "medical-knowledge",
  });

console.log("Chroma connected");