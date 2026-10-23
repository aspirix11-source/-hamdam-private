import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerEmail = process.env.HAMDAM_OWNER_EMAIL?.trim().toLowerCase();
  if (!url || !anon || !serviceKey || !ownerEmail) {
    return NextResponse.json({ error: "Server configuration is incomplete. Add Supabase URL, publishable key, service role key, and owner email in Vercel." }, { status: 500 });
  }

  const cookieStore = await cookies();
  const authClient = createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => { try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
    },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user || user.email?.toLowerCase() !== ownerEmail) {
    return NextResponse.json({ error: "Only the configured Hamdam owner can invite members." }, { status: 403 });
  }

  let body: { email?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (email === ownerEmail) return NextResponse.json({ error: "You are already the owner." }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: new URL("/", request.url).toString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: "Invitation email sent." });
}
