import type {
  BasicTriageResult,
  TriageIntent,
  TriageSentiment,
} from "./types";

function createSubject(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("lock")) return "Smart lock support issue";
  if (lower.includes("camera")) return "Camera support issue";
  if (lower.includes("thermostat")) return "Thermostat support issue";
  if (lower.includes("battery")) return "Battery troubleshooting request";

  return "General support request";
}

function classifyIntent(message: string): TriageIntent {
  const lower = message.toLowerCase();

  if (
    lower.includes("frustrated") ||
    lower.includes("angry") ||
    lower.includes("not working") ||
    lower.includes("complaint")
  ) {
    return "complaint";
  }

  if (
    lower.includes("please") ||
    lower.includes("can you") ||
    lower.includes("help me")
  ) {
    return "request";
  }

  return "question";
}

function classifySentiment(message: string): TriageSentiment {
  const lower = message.toLowerCase();

  if (
    lower.includes("frustrated") ||
    lower.includes("angry") ||
    lower.includes("terrible") ||
    lower.includes("not working")
  ) {
    return "negative";
  }

  if (lower.includes("thanks") || lower.includes("great")) {
    return "positive";
  }

  return "neutral";
}

export function runBasicTriage(message: string): BasicTriageResult {
  const subject = createSubject(message);
  const intent = classifyIntent(message);
  const sentiment = classifySentiment(message);
  const priority = sentiment === "negative" ? "P1" : "P2";

  return {
    subject,
    intent,
    sentiment,
    priority,
  };
}
