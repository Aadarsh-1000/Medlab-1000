import fs from "fs";
import pdf from "pdf-parse";

import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

import { Chroma } from "@langchain/community/vectorstores/chroma";

import { HuggingFaceInferenceEmbeddings }
from "@langchain/community/embeddings/hf";

export async function loadMedicalKnowledge() {

  const dataBuffer = fs.readFileSync("medical.pdf");

  const pdfData = await pdf(dataBuffer);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const docs = await splitter.createDocuments([
    pdfData.text,
  ]);

  const embeddings =
    new HuggingFaceInferenceEmbeddings({
      apiKey: process.env.HF_API_KEY,
      model: "sentence-transformers/all-MiniLM-L6-v2",
    });

  const vectorStore = await Chroma.fromDocuments(
    docs,
    embeddings,
    {
      collectionName: "medical-db",
    }
  );

  return vectorStore;
}