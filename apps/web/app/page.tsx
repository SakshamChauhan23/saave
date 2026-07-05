import { redirect } from "next/navigation";
import { forwardAuthCodeIfPresent } from "@/lib/auth/forward-auth-code";
import { getSessionUser } from "@/lib/supabase/server";

type HomeProps = {
  searchParams: Promise<{ code?: string; token_hash?: string; type?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  forwardAuthCodeIfPresent(params);

  const session = await getSessionUser();
  redirect(session ? "/inbox" : "/login");
}