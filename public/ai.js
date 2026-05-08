async function sendMessage() {
  const input = document.getElementById("user-input");
  const chatBox = document.getElementById("chat-box");
  const sendButton = document.querySelector(".input-box button");

  const userText = input.value.trim();
  if (!userText) return;

  chatBox.innerHTML += `<div class="message user">${userText}</div>`;
  input.value = "";
  input.disabled = true;
  sendButton.disabled = true;

  const loadingId = `loading-${Date.now()}`;
  chatBox.innerHTML += `
    <div id="${loadingId}" class="message bot loading-message" aria-label="AI is typing">
      <span class="loading-text">Thinking</span>
      <div class="loading" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
           chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: userText }),
    });

    const data = await res.json();
    console.log("AI RESPONSE:", data);

    if (!res.ok) {
      throw new Error(data.message || "Unable to get a response right now.");
    }
    const botReply =
      (data.response && data.response.trim()) ||
      "AI returned empty response";

    document.getElementById(loadingId)?.remove();
    chatBox.innerHTML += `<div class="message bot">${botReply}</div>`;
  } catch (error) {

    document.getElementById(loadingId)?.remove();
    chatBox.innerHTML += `<div class="message bot">Error: ${error.message}</div>`;
  } finally {
    input.disabled = false;
    sendButton.disabled = false;
    input.focus();
  }

  chatBox.scrollTop = chatBox.scrollHeight; 
}
