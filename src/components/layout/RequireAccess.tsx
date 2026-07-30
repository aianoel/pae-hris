import { Link, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/store/auth-context";
import { canAccess } from "@/lib/access";

/**
 * Route-level access guard. Wraps a page element and, if the signed-in user
 * lacks access to the current path, renders a "no access" notice instead —
 * blocking direct-URL navigation to modules hidden from the sidebar.
 */
export function RequireAccess({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (canAccess(user?.access, pathname)) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <ShieldAlert className="h-7 w-7" />
          </span>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">Access restricted</h2>
            <p className="text-sm text-muted-foreground">
              You don&apos;t have permission to open this module. Contact an administrator if you
              believe this is a mistake.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
