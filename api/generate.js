import { createAgent } from "../../lib/agent";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      message: "Method not allowed",
    });
  }

  try {

    const { prompt } = req.body;

    const agent = await createAgent();

    const result = await agent.invoke({
      input: prompt,
    });

    res.status(200).json({
      response: result.output,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: error.message,
    });

  }
}