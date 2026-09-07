import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 text-center">
      <div className="relative flex items-center justify-center mb-6">
        <div className="absolute h-28 w-28 animate-pulse rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 blur-2xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl">
          <Compass className="h-8 w-8 text-indigo-600 dark:text-indigo-400 animate-spin-slow" />
        </div>
      </div>

      <span className="text-xs font-mono font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-2">
        Error 404
      </span>

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">
        Page not found
      </h1>

      <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-400 max-w-md mb-8 leading-relaxed">
        The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
      </p>

      <Button
        asChild
        className="h-10 px-5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-zinc-100 dark:text-zinc-900 font-medium rounded-xl shadow-lg transition-all cursor-pointer"
      >
        <Link href="/">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Return Home
        </Link>
      </Button>
    </div>
  );
}
