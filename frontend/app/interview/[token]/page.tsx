import { redirect } from "next/navigation";

/** The candidate flow now lives at /join/[token]; keep the old path working for any saved links. */
export default async function LegacyInterviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/join/${encodeURIComponent(token)}`);
}
