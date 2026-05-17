import Head from "next/head";
import MinimalAppChrome from "@/components/marketing/MinimalAppChrome";
import BossMindAdminDashboard from "@/components/bossmind/BossMindAdminDashboard";

export default function BossMindAdminPage() {
  return (
    <MinimalAppChrome>
      <Head>
        <title>BossMind Master Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <BossMindAdminDashboard />
    </MinimalAppChrome>
  );
}
