// ============================================
// FULLY FIXED FRONTEND CHAT UI
// WITH DEBUG PANEL
// ============================================

import { useState } from "react";

export default function Home() {

  const [prompt, setPrompt] = useState("");

  const [messages, setMessages] = useState([

    {
      role: "assistant",
      text: "Hello 👋\nAsk me any medical question."
    }

  ]);

  const [loading, setLoading] = useState(false);



  
async function sendMessage() {

  if (!prompt.trim()) return;

  const userMessage = {
    role: "user",
    text: prompt
  };

  setMessages(prev => [...prev, userMessage]);

  const currentPrompt = prompt;

  setPrompt("");

  setLoading(true);

  try {

    const response = await fetch("/api/chat", {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        prompt: currentPrompt
      })

    });




    // =====================================
    // SAFER RESPONSE HANDLING
    // =====================================

    const rawText =
      await response.text();

    console.log("RAW SERVER RESPONSE:");
    console.log(rawText);

    let data;

    try {

      data = JSON.parse(rawText);

    } catch {

      throw new Error(
        "Backend returned invalid JSON"
      );

    }




    // =====================================
    // HANDLE API ERRORS
    // =====================================

    if (!response.ok) {

      throw new Error(
        data.message || "Server error"
      );

    }




    // =====================================
    // ADD ASSISTANT MESSAGE
    // =====================================

    const assistantMessage = {

      role: "assistant",

      text:
        data.response ||
        "No response generated",

      debug:
        data.debug || [],

      extractedSymptoms:
        data.extractedSymptoms || [],

      rankedDiseases:
        data.rankedDiseases || [],

      webResults:
        data.webResults || []

    };

    setMessages(prev => [
      ...prev,
      assistantMessage
    ]);

  } catch (error) {

    console.error(error);

    setMessages(prev => [

      ...prev,

      {
        role: "assistant",

        text:
          `Error: ${error.message}`,

        debug: [

          {
            step: "FRONTEND ERROR",
            data: error.message
          }

        ]

      }

    ]);

  }

  setLoading(false);

}

  return (

    <div
      style={{
        background: "#000",
        minHeight: "100vh",
        padding: "40px",
        color: "#fff",
        fontFamily: "sans-serif"
      }}
    >

      {/* TITLE */}
      <h1
        style={{
          textAlign: "center",
          fontSize: "64px",
          marginBottom: "40px"
        }}
      >
        MEDLAB AI
      </h1>



      {/* CHAT */}
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto"
        }}
      >

        {messages.map((msg, index) => (

          <div key={index}>

            {/* USER MESSAGE */}
            {msg.role === "user" && (

              <div
                style={{
                  background: "#e7e3ed",
                  color: "#000",
                  padding: "22px",
                  borderRadius: "20px",
                  marginBottom: "20px",
                  fontSize: "30px"
                }}
              >
                {msg.text}
              </div>

            )}



            {/* ASSISTANT MESSAGE */}
            {msg.role === "assistant" && (

              <div
                style={{
                  background: "#16161d",
                  padding: "25px",
                  borderRadius: "20px",
                  marginBottom: "30px"
                }}
              >

                {/* MAIN RESPONSE */}
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    lineHeight: "1.8",
                    fontSize: "28px"
                  }}
                >
                  {msg.text}
                </div>



                {/* DEBUG PANEL */}
                {msg.debug &&
                 msg.debug.length > 0 && (

                  <div
                    style={{
                      marginTop: "30px",
                      background: "#0d1117",
                      border: "1px solid #333",
                      borderRadius: "15px",
                      padding: "20px"
                    }}
                  >

                    <div
                      style={{
                        fontSize: "24px",
                        color: "#58a6ff",
                        marginBottom: "20px",
                        fontWeight: "bold"
                      }}
                    >
                      AI PIPELINE DEBUG
                    </div>



                    {msg.debug.map((item, i) => (

                      <div
                        key={i}
                        style={{
                          marginBottom: "20px",
                          borderBottom:
                            "1px solid #222",
                          paddingBottom: "15px"
                        }}
                      >

                        <div
                          style={{
                            color: "#7ee787",
                            marginBottom: "10px",
                            fontSize: "20px",
                            fontWeight: "bold"
                          }}
                        >
                          {item.step}
                        </div>

                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            color: "#c9d1d9",
                            fontSize: "16px",
                            overflowX: "auto"
                          }}
                        >
                          {JSON.stringify(
                            item.data,
                            null,
                            2
                          )}
                        </pre>

                      </div>

                    ))}

                  </div>

                )}



                {/* EXTRACTED SYMPTOMS */}
                {msg.extractedSymptoms &&
                 msg.extractedSymptoms.length > 0 && (

                  <div
                    style={{
                      marginTop: "30px"
                    }}
                  >

                    <div
                      style={{
                        fontSize: "24px",
                        marginBottom: "15px",
                        color: "#58a6ff"
                      }}
                    >
                      Extracted Symptoms
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        flexWrap: "wrap"
                      }}
                    >

                      {msg.extractedSymptoms.map(
                        (symptom, i) => (

                        <div
                          key={i}
                          style={{
                            background: "#1f6feb",
                            padding:
                              "10px 18px",
                            borderRadius: "999px",
                            fontSize: "18px"
                          }}
                        >
                          {symptom}
                        </div>

                      ))}

                    </div>

                  </div>

                )}



                {/* RANKED DISEASES */}
                {msg.rankedDiseases &&
                 msg.rankedDiseases.length > 0 && (

                  <div
                    style={{
                      marginTop: "30px"
                    }}
                  >

                    <div
                      style={{
                        fontSize: "24px",
                        marginBottom: "15px",
                        color: "#58a6ff"
                      }}
                    >
                      Ranked Diseases
                    </div>

                    {msg.rankedDiseases.map(
                      (disease, i) => (

                      <div
                        key={i}
                        style={{
                          background: "#111",
                          padding: "15px",
                          borderRadius: "12px",
                          marginBottom: "10px"
                        }}
                      >

                        <div
                          style={{
                            fontSize: "20px"
                          }}
                        >
                          {disease.disease}
                        </div>

                        <div
                          style={{
                            color: "#999",
                            marginTop: "5px"
                          }}
                        >
                          Score: {disease.score}
                        </div>

                      </div>

                    ))}

                  </div>

                )}

              </div>

            )}

          </div>

        ))}



        {/* LOADING */}
        {loading && (

          <div
            style={{
              marginTop: "20px",
              color: "#888",
              fontSize: "24px"
            }}
          >
            Thinking...
          </div>

        )}



        {/* INPUT BAR */}
        <div
          style={{
            display: "flex",
            gap: "15px",
            marginTop: "30px",
            position: "sticky",
            bottom: "20px"
          }}
        >

          <input

            value={prompt}

            onChange={(e) =>
              setPrompt(e.target.value)
            }

            onKeyDown={(e) => {
              if (e.key === "Enter") {
                sendMessage();
              }
            }}

            placeholder="Ask a medical question..."

            style={{
              flex: 1,
              background: "#111",
              color: "#fff",
              border: "1px solid #333",
              padding: "22px",
              borderRadius: "999px",
              fontSize: "24px",
              outline: "none"
            }}
          />



          <button

            onClick={sendMessage}

            style={{
              width: "80px",
              height: "80px",
              borderRadius: "999px",
              border: "none",
              background: "#b392f0",
              cursor: "pointer"
            }}
          />

        </div>

      </div>

    </div>

  );

}