const sessions = new Map();

export function getHistory(sessionId) {

  if (!sessions.has(sessionId)) {

    sessions.set(sessionId, [
      {
        role: "system",
        content: `
You are MEDLAB AI.

Remember previous conversation context.

If user mentioned:
- diseases
- medications
- symptoms
- history
- allergies
- age
- treatments

use them naturally in future replies.

Do NOT hallucinate memory.
Only remember what user actually said.
`,
      },
    ]);

  }

  return sessions.get(sessionId);

}

export function addMessage(
  sessionId,
  role,
  content
) {

  const history =
    getHistory(sessionId);

  history.push({
    role,
    content,
  });

  // keep last 30 msgs
  if (history.length > 30) {

    history.splice(
      1,
      history.length - 30
    );

  }

}

export function clearHistory(
  sessionId
) {

  sessions.delete(sessionId);

}