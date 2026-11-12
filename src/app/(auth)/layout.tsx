import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col p-6 sm:p-10">
        <Link href="/"><Logo /></Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </div>
      <div className="brand-gradient relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-end lg:p-12">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <blockquote className="relative max-w-md text-white">
          <p className="text-2xl font-semibold leading-snug">“Someone comments INFO on a Reel, and thirty seconds later they’re a qualified lead in our CRM.”</p>
          <p className="mt-4 text-white/75">That’s the workflow ViralChat AI is built for.</p>
        </blockquote>
      </div>
    </div>
  );
}
