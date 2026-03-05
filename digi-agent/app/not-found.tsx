import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
      <h2 className="text-xl font-semibold text-heading">Page not found</h2>
      <p className="max-w-md text-center text-muted-foreground">
        We couldn't find the page you're looking for.
      </p>
      <Button asChild>
        <Link href="/">Go back to the home page</Link>
      </Button>
    </div>
  );
}
