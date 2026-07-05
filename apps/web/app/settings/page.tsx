import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { SettingsApp } from "./settings-app";

export default async function SettingsPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  return <SettingsApp userEmail={session.user.email ?? "you"} />;
}
