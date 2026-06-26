export type PostSalesActions = {
  onboarding_blocker_detected: boolean;
  task_created: boolean;
  product_signal_created: boolean;
  health_event_created: boolean;
  account_health_updated: boolean;
};

const onboardingBlockerPhrases = [
  "blocked",
  "go live",
  "go-live",
  "implementation",
  "setup not working",
  "api setup",
  "cannot launch",
  "launch is blocked",
  "onboarding blocked",
];

export function createEmptyPostSalesActions(): PostSalesActions {
  return {
    onboarding_blocker_detected: false,
    task_created: false,
    product_signal_created: false,
    health_event_created: false,
    account_health_updated: false,
  };
}

export function detectOnboardingBlocker(message: string) {
  const lower = message.toLowerCase();

  return onboardingBlockerPhrases.some((phrase) => lower.includes(phrase));
}
