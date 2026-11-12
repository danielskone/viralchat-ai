export const metadata = { title: "Terms of Service" };

export default function Terms() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 px-4 py-16 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold">
      <h1 className="text-3xl font-semibold">Terms of Service</h1>
      <p className="rounded-xl border border-warning/50 bg-warning/10 p-3">Template terms. Have them reviewed by counsel before launch.</p>
      <h2>Acceptable use</h2>
      <p>You must comply with Meta’s Platform Terms, Messenger and Instagram policies, and applicable messaging, privacy and anti-spam laws. No unsolicited bulk messaging, deceptive content or prohibited goods.</p>
      <h2>AI content</h2>
      <p>AI replies are generated from the information you provide. You are responsible for the accuracy of your knowledge base and for reviewing automated communications.</p>
      <h2>Subscriptions</h2>
      <p>Paid plans renew monthly until cancelled via the billing portal. Usage limits apply per plan.</p>
    </article>
  );
}
