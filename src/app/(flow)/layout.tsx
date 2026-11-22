import type { ReactNode } from "react";
import { Backdrop } from "@/components/Backdrop";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function FlowLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <>
      <Backdrop />
      {children}
    </>
  );
}
