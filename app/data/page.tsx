import { AppShell } from "../../components/AppShell";
import { DataOnboardingWorkspace } from "../../components/DataOnboardingWorkspace";

export default function DataOnboardingPage() {
  return (
    <AppShell active="data">
      <DataOnboardingWorkspace />
    </AppShell>
  );
}
