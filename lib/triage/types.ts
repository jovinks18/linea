export type TriageIntent = "question" | "request" | "complaint" | "no_action";

export type TriageSentiment = "positive" | "neutral" | "negative";

export type TriagePriority = "P0" | "P1" | "P2" | "P3";

export type BasicTriageResult = {
  subject: string;
  intent: TriageIntent;
  sentiment: TriageSentiment;
  priority: TriagePriority;
};
