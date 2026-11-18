import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";

export default async function MarketingLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link href="/"><Logo /></Link>
          <nav className="ml-6 hidden gap-6 text-sm text-muted-foreground md:flex">
            <Link href="/#features" className="hover:text-foreground">Features</Link>
            <Link href="/#how" className="hover:text-foreground">How it works</Link>
            <Link href="/#pricing" className="hover:text-foreground">Pricing</Link>
          </nav>
          <div className="flex-1" />
          <ThemeToggle />
          {user ? (
            <Link href="/dashboard" className={buttonVariants({ variant: "gradient", size: "sm" })}>Open dashboard</Link>
          ) : (
            <>
              <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>Sign in</Link>
              <Link href="/signup" className={buttonVariants({ variant: "gradient", size: "sm" })}>Start free trial</Link>
            </>
          )}
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <Logo className="text-foreground" />
          <p className="flex-1">© {new Date().getFullYear()} ViralChat AI. Turn conversations into customers automatically.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/data-deletion" className="hover:text-foreground">Data deletion</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
