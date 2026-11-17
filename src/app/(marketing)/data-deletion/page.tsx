import { supportEmail } from "@/lib/legal";

export const metadata = { title: "Data Deletion" };

export const dynamic = "force-dynamic";

export default function DataDeletion() {
  const email = supportEmail();
  return (
    <article className="mx-auto max-w-3xl space-y-4 px-4 py-16 text-sm leading-relaxed">
      <h1 className="text-3xl font-semibold">Data deletion instructions</h1>
      <p><strong>Businesses using ViralChat AI:</strong> open Settings → Delete workspace to remove all data, or delete individual contacts from their profile. Disconnecting Meta on the Integrations page revokes our webhook subscription and deletes the stored Page token.</p>
      <p><strong>People who messaged a business:</strong> ask that business to delete your contact record, or email {email ? <a className="text-primary underline" href={`mailto:${email}`}>{email}</a> : "the contact address listed on our website"} with your Instagram username or Facebook name and the business you messaged. We will delete the data within 30 days and confirm by email.</p>
      <p>You can also remove ViralChat AI’s access in Facebook Settings → Business Integrations.</p>
    </article>
  );
}
