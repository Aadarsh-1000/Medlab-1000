import { FastMCP } from "fastmcp";
import { z } from "zod";

const server = new FastMCP({
  name: "medlab-mcp",
  version: "1.0.0",
});

server.tool({
  name: "symptom_checker",
  description: "Analyze symptoms and suggest possible conditions",
  parameters: z.object({
    symptoms: z.string(),
  }),

  execute: async ({ symptoms }) => {
    return {
      result: `
Possible conditions for:
${symptoms}

- Viral infection
- Flu
- Dehydration

Recommend consulting a doctor.
      `,
    };
  },
});

server.tool({
  name: "drug_info",
  description: "Get drug information",
  parameters: z.object({
    medicine: z.string(),
  }),

  execute: async ({ medicine }) => {
    return {
      result: `
${medicine}

Uses:
- Pain relief

Side effects:
- Drowsiness
- Nausea
      `,
    };
  },
});
server.tool({
  name: "medical_knowledge_base",
  description: "Search trusted medical documents",
  parameters: z.object({
    query: z.string(),
  }),

  execute: async ({ query }) => {

    const vectorStore =
      await loadMedicalKnowledge();

    const retriever =
      vectorStore.asRetriever();

    const docs =
      await retriever.invoke(query);

    return {
      result: docs.map(d => d.pageContent).join("\n"),
    };
  },
});

export default server;