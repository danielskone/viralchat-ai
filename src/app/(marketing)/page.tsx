import Link from "next/link";
import { Bot, Workflow, MessagesSquare, Users, BarChart3, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { BASE_PLAN, TRIAL_DAYS } from "@/lib/plans";
import { PlanCard } from "@/components/billing/plan-card";
import { InstagramIcon, MessengerIcon } from "@/components/brand-icons";

const FEATURES = [
  { icon: Workflow, title: "Comment-to-DM automations", body: "Someone comments a keyword on your post or Reel and instantly gets a DM with your link, offer or download." },
  { icon: Bot, title: "AI assistant that knows your business", body: "Answers FAQs from your own knowledge base, never invents prices, and hands tricky conversations to your team." },
  { icon: MessagesSquare, title: "One inbox for Instagram & Messenger", body: "Assign conversations, leave internal notes, use saved and AI-suggested replies, and take over from the bot anytime." },
  { icon: Users, title: "Built-in CRM & lead scoring", body: "Every conversation becomes a contact with tags, custom fields, a Hot/Warm/Cold score and a pipeline stage." },
  { icon: BarChart3, title: "Analytics that matter", body: "Leads, response rate, automated messages, AI replies and workflow completion, with downloadable reports." },
  { icon: ShieldCheck, title: "Policy-safe by design", body: "Official Meta APIs, 24-hour messaging window enforcement, encrypted tokens and signed webhooks." },
];

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 -top-40 -z-10 mx-auto h-[36rem] max-w-5xl rounded-full bg-gradient-to-br from-blue-500/20 via-violet-500/20 to-fuchsia-500/10 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium">
              <Sparkles className="size-3.5 text-primary" /> AI-powered social automation
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Turn conversations into <span className="brand-text">customers</span> automatically.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              ViralChat AI replies to Instagram comments and DMs, qualifies leads with AI, and drops them into your CRM, so you can grow without living in your inbox.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className={buttonVariants({ variant: "gradient", size: "lg" })}>Start free trial <ArrowRight /></Link>
              <a href="#how" className={buttonVariants({ variant: "outline", size: "lg" })}>See how it works</a>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Free plan · No credit card · Works with Instagram professional accounts and Facebook Pages</p>
          </div>
          <Card className="relative p-5 shadow-xl">
            <div className="flex items-center gap-2 border-b pb-3 text-sm">
              <InstagramIcon className="size-4 text-pink-500" />
              <span className="font-medium">@glowstudio · Reel comment</span>
            </div>
            <div className="flex flex-col gap-3 py-4 text-sm">
              <div className="self-start rounded-2xl bg-muted px-4 py-2">💬 <strong>maya.j</strong>: INFO</div>
              <div className="brand-gradient self-end rounded-2xl px-4 py-2 text-white">Hey Maya! 🙌 Here’s the guide you asked for → glow.co/guide</div>
              <div className="self-end rounded-2xl bg-primary px-4 py-2 text-primary-foreground">What’s the best email to send extra tips to?</div>
              <div className="self-start rounded-2xl bg-muted px-4 py-2">maya.j@example.com</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-accent/60 p-3 text-xs">
              <span className="font-medium">CRM updated:</span>
              <span className="rounded-full bg-card px-2 py-0.5">tag: comment-lead</span>
              <span className="rounded-full bg-card px-2 py-0.5">score +20</span>
              <span className="rounded-full bg-card px-2 py-0.5">email captured</span>
            </div>
          </Card>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Everything you need to automate conversations</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">A drag-and-drop builder simple enough for beginners and powerful enough for agencies.</p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="p-6">
              <span className="brand-gradient flex size-10 items-center justify-center rounded-xl text-white"><f.icon className="size-5" /></span>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="how" className="border-y bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Live in four steps</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-4">
            {[
              ["Connect", "Link your Instagram professional account and Facebook Page with secure Meta login."],
              ["Teach your AI", "Add FAQs, services and pricing. Pick a tone and goal for your assistant."],
              ["Pick a template", "Comment-to-DM, lead qualification, booking funnel and more. Customize in the visual builder."],
              ["Test & activate", "Chat with your flow in the simulator, then switch it on and watch leads roll in."],
            ].map(([t, b], i) => (
              <li key={t} className="rounded-2xl border bg-card p-6">
                <span className="text-sm font-semibold text-primary">Step {i + 1}</span>
                <h3 className="mt-1 font-semibold">{t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{b}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex items-center justify-center gap-6 text-muted-foreground">
            <span className="flex items-center gap-2 text-sm"><InstagramIcon className="size-5" /> Instagram</span>
            <span className="flex items-center gap-2 text-sm"><MessengerIcon className="size-5" /> Messenger</span>
            <span className="text-sm">WhatsApp, SMS & email coming next</span>
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-semibold tracking-tight">One simple plan</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
          Everything included for ${BASE_PLAN.priceMonthly}/month. Try it free for {TRIAL_DAYS} days and cancel anytime.
        </p>
        <PlanCard className="mx-auto mt-10 w-full max-w-md">
          <Link href="/signup" className={buttonVariants({ variant: "gradient", size: "lg" })}>Start your {TRIAL_DAYS}-day free trial</Link>
        </PlanCard>
      </section>
    </>
  );
}
