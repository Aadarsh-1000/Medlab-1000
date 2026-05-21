import { OpenAIEmbeddings }
from "@langchain/openai";

import { Chroma }
from "@langchain/community/vectorstores/chroma";

const embeddings =
  new OpenAIEmbeddings({
    apiKey:
      process.env.OPENAI_API_KEY,
  });

export const vectorStore =
  new Chroma(embeddings, {
    collectionName:
      "medical-knowledge",

    url:
      "http://localhost:8000",
  });