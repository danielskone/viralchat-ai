import { supportEmail } from "@/lib/legal";

export const metadata = { title: "Privacy Policy" };

export const dynamic = "force-dynamic";

export default function Privacy() {
  const email = supportEmail();
  return (
    <article className="mx-auto max-w-3xl space-y-4 px-4 py-16 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold">
      <h1 className="text-3xl font-semibold">Privacy Policy</h1>
      {!email && <p className="rounded-xl border border-warning/50 bg-warning/10 p-3">Template policy. Set SUPPORT_EMAIL and have it reviewed by counsel before launch.</p>}
      <h2>What we collect</h2>
      <p>Account data (name, email, hashed password); workspace data you add (contacts, notes, knowledge base); and, when you connect Meta, messages, comments and public profile info (name, username, profile picture) of people who message or comment on your connected accounts.</p>
      <h2>How we use it</h2>
      <p>To deliver automated and human replies on your behalf, power your inbox and CRM, generate AI replies using the knowledge you provide, and produce analytics. We do not sell personal data.</p>
      <h2>Processors</h2>
      <p>Meta Platforms (messaging), OpenAI (AI replies, when enabled), Stripe (billing), and our hosting and database providers.</p>
      <h2>Security</h2>
      <p>Access tokens and API keys are encrypted at rest (AES-256-GCM). Webhooks are signature-verified. Workspace data is isolated per workspace.</p>
      <h2>Retention & deletion</h2>
      <p>Workspace owners can delete individual contacts and their messages or the entire workspace at any time. See <a className="text-primary underline" href="/data-deletion">Data deletion</a>.</p>
      <h2>Contact</h2>
      <p>Questions or requests: {email ? <a className="text-primary underline" href={`mailto:${email}`}>{email}</a> : "the contact address listed on our website"}</p>
    </article>
  );
}
