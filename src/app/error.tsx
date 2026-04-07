"use client";

/**
 * Next.js error boundary — catches runtime errors in the page tree
 * and shows a recovery UI instead of a white screen.
 *
 * This file uses the App Router convention: exporting a default component
 * from `app/error.tsx` makes it the error boundary for the root layout's
 * children. Next.js wraps the page in a React error boundary automatically.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h2
          className="font-display font-bold mb-3"
          style={{ fontSize: "var(--text-2xl)" }}
        >
          Something went wrong
        </h2>
        <p
          className="font-ui text-ct-muted mb-6"
          style={{ fontSize: "var(--text-base)" }}
        >
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="ct-btn ct-btn-primary"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
