import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { InboxApp } from "./inbox-app";

export default async function InboxPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  return <InboxApp userEmail={session.user.email ?? "you"} />;
}