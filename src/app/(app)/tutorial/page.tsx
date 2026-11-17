import Link from "next/link";
import { and, count, eq } from "drizzle-orm";
import {
  ArrowRight, Bot, CalendarDays, CheckCircle2, Circle, Hand, Mail, Megaphone, PanelsTopLeft, Plug, Smartphone, Users, Workflow,
} from "lucide-react";
import { db } from "@/db";
import { automations, bookingPages, broadcasts, chatbots, contacts, emailSequences, integrations, knowledgeItems, landingPages } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { Card, CardContent, PageHeader } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Tutorial" };

type Lesson = {
  id: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  why: string;
  steps: React.ReactNode[];
  tip?: React.ReactNode;
  href: string;
  cta: string;
  done?: boolean;
};

export default async function TutorialPage() {
  const ctx = await requireWorkspace();
  const ws = ctx.workspace.id;
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [integ, bot, kb, autos, booking, pages, bcasts, seqs, people] = await Promise.all([
    db.select({ provider: integrations.provider, status: integrations.status }).from(integrations).where(eq(integrations.workspaceId, ws)),
    db.select().from(chatbots).where(eq(chatbots.workspaceId, ws)).limit(1),
    n(db.select({ n: count() }).from(knowledgeItems).where(eq(knowledgeItems.workspaceId, ws))),
    n(db.select({ n: count() }).from(automations).where(and(eq(automations.workspaceId, ws), eq(automations.status, "active")))),
    db.select({ enabled: bookingPages.enabled }).from(bookingPages).where(eq(bookingPages.workspaceId, ws)).limit(1),
    n(db.select({ n: count() }).from(landingPages).where(and(eq(landingPages.workspaceId, ws), eq(landingPages.published, true)))),
    n(db.select({ n: count() }).from(broadcasts).where(and(eq(broadcasts.workspaceId, ws), eq(broadcasts.status, "sent")))),
    n(db.select({ n: count() }).from(emailSequences).where(and(eq(emailSequences.workspaceId, ws), eq(emailSequences.active, true)))),
    n(db.select({ n: count() }).from(contacts).where(and(eq(contacts.workspaceId, ws), eq(contacts.isDemo, false)))),
  ]);
  const connected = (p: string) => integ.some((i) => i.provider === p && i.status === "connected");

  const lessons: Lesson[] = [
    {
      id: "connect",
      short: "Connect",
      icon: Plug,
      title: "Connect Instagram and Messenger",
      why: "This lets ViralChat read and answer your DMs and comments.",
      steps: [
        <>Open <strong>Integrations</strong> and press <strong>Connect with Facebook</strong>.</>,
        <>Log in to Facebook and allow everything it asks for.</>,
        <>Pick your Facebook Page. Its linked Instagram account connects with it.</>,
      ],
      tip: <>Your Instagram must be a Business or Creator account linked to your Facebook Page.</>,
      href: "/integrations",
      cta: "Go to Integrations",
      done: connected("meta"),
    },
    {
      id: "automation",
      short: "Auto-reply",
      icon: Workflow,
      title: "Make your first auto-reply",
      why: "Reply instantly when someone DMs a keyword like PRICE, day or night.",
      steps: [
        <>Open <strong>Templates</strong> and pick one, or press <strong>New automation</strong>.</>,
        <>Click the trigger box and type your keyword (for example <strong>PRICE</strong>).</>,
        <>Click the message box and type your reply. You can use <code>{"{{first_name}}"}</code> and <code>{"{{booking_link}}"}</code>.</>,
        <>Press <strong>Activate</strong>. That also saves it.</>,
        <>Test it: from your <em>personal</em> Instagram or Messenger, send the keyword to your business.</>,
      ],
      tip: <>Don&apos;t test by typing in ViralChat&apos;s inbox. That sends the message <em>to</em> the customer instead.</>,
      href: "/templates",
      cta: "Pick a template",
      done: autos > 0,
    },
    {
      id: "inbox",
      short: "Bot vs. Human",
      icon: Hand,
      title: "Bot mode vs. Human mode in Conversations",
      why: "You can step in and chat yourself any time.",
      steps: [
        <>When you reply in a chat yourself, that chat switches to <strong>Human mode</strong> and automations pause for that person.</>,
        <>When you&apos;re done, press the <strong>Human mode</strong> button at the top of the chat. It flips back to <strong>Bot mode</strong> and automations answer again.</>,
      ],
      tip: <>If an automation &ldquo;stops working&rdquo; for someone, check whether their chat is in Human mode.</>,
      href: "/inbox",
      cta: "Open Conversations",
    },
    {
      id: "ai",
      short: "AI assistant",
      icon: Bot,
      title: "Teach the AI assistant about your business",
      why: "The AI answers questions you didn't write an automation for.",
      steps: [
        <>Open <strong>AI Chatbot</strong>. Give it a name, a greeting and a short description of how it should talk.</>,
        <>Under <strong>Knowledge base</strong>, add your prices, hours, services and common questions.</>,
        <>Try it in the <strong>Preview</strong> chat on the same page, then switch it on.</>,
      ],
      href: "/chatbot",
      cta: "Set up the AI",
      done: !!bot[0]?.enabled && kb > 0,
    },
    {
      id: "booking",
      short: "Booking",
      icon: CalendarDays,
      title: "Let people book appointments",
      why: "Customers pick a time from your calendar without back-and-forth.",
      steps: [
        <>Open <strong>Booking</strong>, tick <strong>Booking is on</strong>, set your hours, and press <strong>Save booking settings</strong>.</>,
        <>Put <code>{"{{booking_link}}"}</code> in any automation message. Each person gets their own link, so the booking lands on their contact.</>,
        <>New bookings show on the Booking page and in your notifications.</>,
      ],
      href: "/booking",
      cta: "Open Booking",
      done: !!booking[0]?.enabled,
    },
    {
      id: "pages",
      short: "Landing page",
      icon: PanelsTopLeft,
      title: "Collect leads with a landing page",
      why: "A simple page with a form for your bio, ads or DMs.",
      steps: [
        <>Open <strong>Landing Pages</strong> and press <strong>New page</strong>.</>,
        <>Change the headline and button text, tick <strong>Published</strong>, and press <strong>Save page</strong>.</>,
        <>Copy the page link and put it in your Instagram bio or an ad.</>,
      ],
      tip: <>Set &ldquo;Then&rdquo; to <strong>show a Book a time button</strong> to turn sign-ups into appointments.</>,
      href: "/pages",
      cta: "Open Landing Pages",
      done: pages > 0,
    },
    {
      id: "contacts",
      short: "Leads",
      icon: Users,
      title: "Keep track of your leads",
      why: "Everyone who messages, signs up or books is saved for you.",
      steps: [
        <><strong>Contacts</strong> lists everyone, with tags like <em>booked</em> or <em>lead-form</em>.</>,
        <><strong>CRM Pipeline</strong> shows each lead&apos;s stage. Drag a card to move it, for example from New Lead to Won.</>,
      ],
      href: "/contacts",
      cta: "Open Contacts",
      done: people > 0,
    },
    {
      id: "broadcasts",
      short: "Broadcasts",
      icon: Megaphone,
      title: "Send a broadcast",
      why: "One message to many people at once, like a sale or announcement.",
      steps: [
        <>Open <strong>Broadcasts</strong> and press <strong>New broadcast</strong>.</>,
        <>Write your message, choose who gets it (for example a tag), and press <strong>Save</strong>.</>,
        <>Check how many people can get it, then press <strong>Send now</strong>.</>,
      ],
      tip: <>Meta only allows this to people who messaged you in the last 24 hours. ViralChat counts them for you and skips the rest.</>,
      href: "/broadcasts",
      cta: "Open Broadcasts",
      done: bcasts > 0,
    },
    {
      id: "email",
      short: "Email",
      icon: Mail,
      title: "Send follow-up emails automatically",
      why: "Emails go out by themselves after someone signs up or books.",
      steps: [
        <>Create a free account at <a className="text-primary underline" href="https://resend.com/signup" target="_blank" rel="noreferrer">resend.com</a> and add your website domain there.</>,
        <>Open <strong>Email Follow-ups</strong>, paste your Resend key and your sending address, and press <strong>Connect</strong>.</>,
        <>Press <strong>Send me a test email</strong> to check it arrives.</>,
        <>Press <strong>New follow-up</strong>, edit the emails, tick <strong>On</strong>, and save.</>,
      ],
      href: "/email",
      cta: "Open Email Follow-ups",
      done: connected("resend") && seqs > 0,
    },
    {
      id: "install",
      short: "Install app",
      icon: Smartphone,
      title: "Put ViralChat on your phone and computer",
      why: "Open it like a normal app from your home screen or Dock.",
      steps: [
        <><strong>iPhone:</strong> open the site in Safari, tap the Share button, then <strong>Add to Home Screen</strong>.</>,
        <><strong>Mac:</strong> open the site in Safari, then choose <strong>File → Add to Dock</strong>.</>,
        <><strong>Android or Windows:</strong> open it in Chrome and choose <strong>Install app</strong> from the menu.</>,
      ],
      href: "/dashboard",
      cta: "Back to Dashboard",
    },
  ];
  const tracked = lessons.filter((l) => l.done !== undefined);
  const doneCount = tracked.filter((l) => l.done).length;

  return (
    <>
      <PageHeader title="Tutorial" description="Short, step-by-step guides for everything in ViralChat. Steps tick off by themselves as you finish them." />
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 pt-6">
          <div>
            <p className="font-semibold">{doneCount} of {tracked.length} set up</p>
            <div className="mt-2 h-2 rounded-full bg-muted">
              <div className="brand-gradient h-2 rounded-full" style={{ width: `${(doneCount / tracked.length) * 100}%` }} />
            </div>
          </div>
          <nav className="flex flex-wrap gap-1.5 text-xs" aria-label="Jump to lesson">
            {lessons.map((l, i) => (
              <a key={l.id} href={`#${l.id}`} className="rounded-full border px-2.5 py-1 hover:bg-muted">
                {i + 1}. {l.short}
              </a>
            ))}
          </nav>
        </CardContent>
      </Card>

      <ol className="flex flex-col gap-4">
        {lessons.map((l, i) => (
          <li key={l.id} id={l.id} className="scroll-mt-24">
            <Card>
              <CardContent className="flex flex-col gap-4 pt-6 md:flex-row">
                <div className="flex items-start gap-3 md:w-72 md:shrink-0">
                  <span className="brand-gradient flex size-10 shrink-0 items-center justify-center rounded-xl text-white"><l.icon className="size-5" /></span>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Lesson {i + 1}</p>
                    <h2 className="font-semibold leading-snug">{l.title}</h2>
                    {l.done !== undefined && (
                      <p className={`mt-1 flex items-center gap-1 text-xs ${l.done ? "text-success" : "text-muted-foreground"}`}>
                        {l.done ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />} {l.done ? "Done" : "Not done yet"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-3 text-sm">
                  <p className="text-muted-foreground">{l.why}</p>
                  <ol className="flex flex-col gap-2">
                    {l.steps.map((s, k) => (
                      <li key={k} className="flex gap-2.5">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">{k + 1}</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                  {l.tip && <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs"><strong>Tip:</strong> {l.tip}</p>}
                  <Link href={l.href} className={buttonVariants({ variant: l.done ? "outline" : "gradient", size: "sm", className: "self-start" })}>
                    {l.cta} <ArrowRight />
                  </Link>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </>
  );
}
