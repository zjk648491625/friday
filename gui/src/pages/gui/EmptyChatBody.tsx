// Modified by Friday AI Team - Rebranded from Continue
import { ConversationStarterCards } from "../../components/ConversationStarters";
import { OnboardingCard } from "../../components/OnboardingCard";
import { WelcomePage } from "./WelcomePage";

export interface EmptyChatBodyProps {
  showOnboardingCard?: boolean;
}

export function EmptyChatBody({ showOnboardingCard }: EmptyChatBodyProps) {
  if (showOnboardingCard) {
    return (
      <div className="mx-2 mt-6">
        <OnboardingCard />
      </div>
    );
  }

  return (
    <div className="mx-2 mt-2">
      <WelcomePage />
      <ConversationStarterCards />
    </div>
  );
}
