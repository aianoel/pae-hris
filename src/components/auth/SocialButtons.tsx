import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GoogleIcon, MicrosoftIcon } from "@/components/brand/icons";

/** Provider keys as presented in the UI. Mapped to Supabase provider ids by
 *  the caller — Microsoft is `azure` on Supabase's side. */
export type SocialProvider = "google" | "microsoft";

interface SocialButtonsProps {
  disabled?: boolean;
  /** Provider currently being handed off, so only that button shows a spinner. */
  pending?: SocialProvider | null;
  onProvider: (provider: SocialProvider) => void;
}

export function SocialButtons({ disabled, pending, onProvider }: SocialButtonsProps) {
  const providers = [
    { key: "google" as const, label: "Google", icon: GoogleIcon, size: "h-[18px] w-[18px]" },
    { key: "microsoft" as const, label: "Microsoft", icon: MicrosoftIcon, size: "h-[17px] w-[17px]" },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {providers.map(({ key, label, icon: Icon, size }) => {
        const busy = pending === key;
        return (
          <Button
            key={key}
            type="button"
            variant="outline"
            size="lg"
            // Disable the whole set while any hand-off is in flight: the page is
            // about to navigate, so a second click would race the first.
            disabled={disabled || Boolean(pending)}
            onClick={() => onProvider(key)}
            className="w-full font-medium"
          >
            {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Icon className={size} />}
            {busy ? "Redirecting…" : label}
          </Button>
        );
      })}
    </div>
  );
}
