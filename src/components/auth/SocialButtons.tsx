import { Button } from "@/components/ui/button";
import { GoogleIcon, MicrosoftIcon } from "@/components/brand/icons";

interface SocialButtonsProps {
  disabled?: boolean;
  onProvider: (provider: "google" | "microsoft") => void;
}

export function SocialButtons({ disabled, onProvider }: SocialButtonsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={disabled}
        onClick={() => onProvider("google")}
        className="w-full font-medium"
      >
        <GoogleIcon className="h-[18px] w-[18px]" />
        Google
      </Button>
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={disabled}
        onClick={() => onProvider("microsoft")}
        className="w-full font-medium"
      >
        <MicrosoftIcon className="h-[17px] w-[17px]" />
        Microsoft
      </Button>
    </div>
  );
}
