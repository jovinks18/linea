import type {
  BasicTriageResult,
  TriageIntent,
  TriageSentiment,
} from "./types";

function createSubject(message: string) {
  const lower = message.toLowerCase();

  if (
    lower.includes("api setup") ||
    lower.includes("go live") ||
    lower.includes("go-live") ||
    lower.includes("implementation") ||
    lower.includes("cannot launch") ||
    lower.includes("onboarding blocked") ||
    lower.includes("launch is blocked")
  ) {
    return "Implementation Blocker - API go-live";
  }

  if (
    lower.includes("smart lock") ||
    /\block\b/.test(lower) ||
    lower.includes("locked out")
  ) {
    return "Smart lock support issue";
  }

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
    lower.includes("not working") ||
    lower.includes("not responding") ||
    lower.includes("does not respond") ||
    lower.includes("doesn't respond") ||
    lower.includes("broken") ||
    lower.includes("failed") ||
    lower.includes("failing") ||
    lower.includes("blocked") ||
    lower.includes("stuck") ||
    lower.includes("cannot access") ||
    lower.includes("can't access") ||
    lower.includes("locked out")
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
