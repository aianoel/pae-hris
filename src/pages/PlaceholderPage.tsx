import { Construction } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon?: LucideIcon;
}

/**
 * A polished "coming soon" surface for routes that aren't the focus of this
 * showcase, so navigation always lands somewhere intentional.
 */
export function PlaceholderPage({ title, description, icon: Icon = Construction }: PlaceholderPageProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
        <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <div className="absolute inset-0 animate-ping rounded-2xl bg-primary/10" />
          <Icon className="relative h-7 w-7 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">This module is on the roadmap</h3>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          The <span className="font-medium text-foreground">{title}</span> experience shares the
          same design system you see across the dashboard. Wire it to your API to go live.
        </p>
        <div className="mt-6 flex gap-2">
          <Button variant="outline" size="lg">
            View documentation
          </Button>
          <Button size="lg">Request early access</Button>
        </div>
      </Card>
    </>
  );
}
