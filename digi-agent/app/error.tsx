'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
      <h2 className="text-xl font-semibold text-heading">
        Algo salió mal
      </h2>
      <p className="max-w-md text-center text-muted-foreground">
        Ha ocurrido un error inesperado. Por favor, inténtalo de nuevo.
      </p>
      <Button onClick={() => reset()} variant="default">
        Intentar de nuevo
      </Button>
    </div>
  );
}
