export default async function handler(req, res) {
  try {
    const prompt = req.body.prompt;

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      }
    );

    const data = await response.json();

    console.log("GROQ RESPONSE:", data);

    if (data.error) {
      return res.status(500).json({
        message: data.error.message,
      });
    }

    const text = data.choices[0].message.content;

    res.status(200).json({
      response: text,
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: error.message,
    });
  }
}