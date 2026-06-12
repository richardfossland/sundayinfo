import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// OAuth/magic-link landing: exchange the code for a session cookie, then send
// the editor to the dashboard. Whitelisted in middleware (no session yet here).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(`${origin}/`);
}
