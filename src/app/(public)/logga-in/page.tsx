import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await currentUser()) redirect("/");
  return <AuthForm mode="login" />;
}
