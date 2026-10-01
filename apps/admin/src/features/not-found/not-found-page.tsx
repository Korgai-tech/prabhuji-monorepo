import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

/** Catch-all inside the shell — a mistyped admin URL keeps the sidebar. */
export function NotFoundPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          That page does not exist. It may not have been built yet — sections
          marked “Soon” in the sidebar are still on their way.
        </p>
      </div>
      <div>
        <Button asChild variant="outline">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
