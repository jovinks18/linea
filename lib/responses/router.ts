const smartLockPhrases = [
  "smart lock",
  "lock",
  "battery",
  "batteries",
  "not responding",
  "does not respond",
  "doesn't respond",
];

const setupSupportPhrases = [
  "setup",
  "configure",
  "onboarding",
  "implementation",
  "help me",
];

function includesAnyPhrase(message: string, phrases: string[]) {
  const lower = message.toLowerCase();

  return phrases.some((phrase) => lower.includes(phrase));
}

export function generateIntakeResponse(input: {
  message: string;
  onboardingBlockerDetected: boolean;
  hasLinkedAccount: boolean;
}): string {
  if (input.onboardingBlockerDetected) {
    if (!input.hasLinkedAccount) {
      return "Thanks for flagging this. I’ve identified this as an onboarding or go-live blocker, but I could not find a linked account for this customer. I created a support case and marked it for human review.";
    }

    return "Thanks for flagging this. I’ve marked this as an onboarding blocker, created a CSM follow-up task, logged an implementation product signal, and updated the account health to at-risk. A team member should follow up before the go-live date.";
  }

  if (includesAnyPhrase(input.message, smartLockPhrases)) {
    return "Thanks for reaching out. I found this looks related to CasaIQ Smart Lock battery troubleshooting. Please replace all four AA batteries with new alkaline batteries, wait 30 seconds, then press the reset button once. Are you currently locked out, or is the lock just not responding?";
  }

  if (includesAnyPhrase(input.message, setupSupportPhrases)) {
    return "Thanks for reaching out. I’ve created a support case and captured your setup question. A team member can review the details and follow up with the right next step.";
  }

  return "Thanks for reaching out. I’ve created a support case and saved your message. Our team can review the details and follow up.";
}
