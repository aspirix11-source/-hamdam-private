import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerEmail = process.env.HAMDAM_OWNER_EMAIL?.trim().toLowerCase();
  if (!url || !anon || !serviceKey || !ownerEmail) {
    return NextResponse.json({ error: "Server setup incomplete. Add Supabase URL, publishable key, service role key, and owner email in Vercel." }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ error: "Sign in again before sending an invitation." }, { status: 401 });
  }
  const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !user || user.email?.toLowerCase() !== ownerEmail) {
    return NextResponse.json({ error: "Only the configured Hamdam owner can invite members." }, { status: 403 });
  }
  let body: { email?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (email === ownerEmail) return NextResponse.json({ error: "You are already the owner." }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: pending, error: insertError } = await admin.from("invitations").insert({
    email, invited_by: user.id, token_hash: randomUUID(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString()
  }).select("id").single();
  if (insertError) return NextResponse.json({ error: "Could not create invitation record: " + insertError.message }, { status: 400 });

  // Always return invite links to the public production domain, never a protected preview deployment.
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://hamdam-private.vercel.app").replace(/\\/$/, "");
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: siteUrl + "/" });
  if (error) {
    await admin.from("invitations").delete().eq("id", pending.id);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: "Invitation email sent. The private chat will be created when the invited account is provisioned." });
}
