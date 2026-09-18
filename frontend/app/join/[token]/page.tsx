import { JoinFlow } from "@/components/candidate/join-flow";

export const metadata = { title: "Join your interview — VeriTrust" };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinFlow token={token} />;
}
