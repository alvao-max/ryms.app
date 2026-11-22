import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Backdrop } from "@/components/Backdrop";
import { TabBar } from "@/components/Chrome";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  // Utloggad: bara startsidan (landningssidan) visas här; övriga sidor skickar själva vidare till inloggningen.
  if (!user) return <>{children}</>;
  if (!user.onboarded) redirect("/kom-igang");
  return (
    <>
      <Backdrop />
      {children}
      <TabBar />
    </>
  );
}
