import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceKey) return NextResponse.json({ error: "Push server configuration is incomplete." }, { status: 500 });
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Session is invalid." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const subscription = body?.subscription;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.from("push_subscriptions").upsert({
    user_id: user.id,
    endpoint: subscription.endpoint,
    subscription,
    updated_at: new Date().toISOString()
  }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: "Could not save push subscription: " + error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
