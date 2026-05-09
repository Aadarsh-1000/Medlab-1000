export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      message: "Method not allowed"
    });
  }


  try {


    const { prompt } = req.body;

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
        },

        body: JSON.stringify({

          model: "llama-3.1-8b-instant",

          messages: [
            {
              role: "system",

              content: `
                       You are MEDLAB AI, a helpful medical assistant.

Always format responses using clean Markdown:
- Use headings
- Use bullet points
- Use bold text
- Use code blocks when needed
- Keep formatting neat
`

            },
            {
              role: "user",
              content: prompt
            }
          ],

          temperature: 0.7,
          max_tokens: 1024

        })
      }
    );

    const data = await response.json();

    console.log(data);

    if (!response.ok) {
      return res.status(response.status).json({
        message:
          data.error?.message ||
          "Groq API Error"
      });
    }

    const reply =
      data.choices?.[0]?.message?.content ||
      "No response generated";

    res.status(200).json({
      response: reply
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: error.message
    });

  }
}