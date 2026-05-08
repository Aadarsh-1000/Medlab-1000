import { getSession } from "../../../medlabAI/api/_lib/auth.js";

export default function handler(req, res) {
  const user = getSession(req);
  res.status(200).json(user || {});
}

