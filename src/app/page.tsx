import Link from "next/link";
import { Button } from "@/components/ui/button";
import { stackServerApp } from "@/lib/stack/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await stackServerApp.getUser();

  if (user) {
    return redirect("/projects");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-background to-muted">
      <div className="mx-auto max-w-2xl px-4 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-7xl">
          Aileen
        </h1>
        <p className="mt-6 text-xl text-muted-foreground sm:text-2xl">
          Open Source CodeGen
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Button asChild size="lg">
            <Link href="/handler/sign-in">Sign in now to get started</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
