import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

async function clients(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerEmail = process.env.HAMDAM_OWNER_EMAIL?.trim().toLowerCase();
  if (!url || !anon || !serviceKey || !ownerEmail) {
    return { error: "Server setup incomplete. Check HAMDAM_OWNER_EMAIL and Supabase server environment variables.", status: 500 as const };
  }
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/, "");
  if (!token) return { error: "Sign in again.", status: 401 as const };
  const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error || !user) return { error: "Session expired. Sign in again.", status: 401 as const };
  if (user.email?.toLowerCase() !== ownerEmail) return { error: "Only the Hamdam owner can manage members.", status: 403 as const };
  return {
    admin: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    ownerId: user.id,
    ownerEmail
  };
}

export async function GET(request: Request) {
  const result = await clients(request);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const [invites, users] = await Promise.all([
    result.admin.from("invitations").select("id,email,expires_at,invited_by").eq("invited_by", result.ownerId).order("expires_at", { ascending: false }).limit(50),
    result.admin.auth.admin.listUsers({ page: 1, perPage: 100 })
  ]);
  if (invites.error) return NextResponse.json({ error: "Could not load invitations: " + invites.error.message }, { status: 500 });
  if (users.error) return NextResponse.json({ error: "Could not load members: " + users.error.message }, { status: 500 });
  return NextResponse.json({
    invitations: (invites.data ?? []).filter((i: any) => new Date(i.expires_at).getTime() > Date.now()),
    members: users.data.users.filter(u => u.email?.toLowerCase() !== result.ownerEmail).map(u => ({
      id: u.id, email: u.email, banned: !!u.banned_until && new Date(u.banned_until).getTime() > Date.now()
    }))
  });
}

export async function POST(request: Request) {
  const result = await clients(request);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const body = await request.json().catch(() => null);
  if (body?.action === "reject_invitation" && typeof body.id === "string") {
    const { error } = await result.admin.from("invitations").delete().eq("id", body.id).eq("invited_by", result.ownerId);
    if (error) return NextResponse.json({ error: "Could not remove invitation: " + error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "revoke_member" && typeof body.id === "string") {
    const { data: target, error: lookupError } = await result.admin.auth.admin.getUserById(body.id);
    if (lookupError || !target.user) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    if (target.user.email?.toLowerCase() === result.ownerEmail || target.user.id === result.ownerId) {
      return NextResponse.json({ error: "Owner account cannot be removed here." }, { status: 400 });
    }
    const { error } = await result.admin.auth.admin.updateUserById(body.id, { ban_duration: "876000h" });
    if (error) return NextResponse.json({ error: "Could not revoke access: " + error.message }, { status: 500 });
    return NextResponse.json({ ok: true, message: "Member sign-in access revoked. Chat history is preserved." });
  }
  if (body?.action === "restore_member" && typeof body.id === "string") {
    const { data: target, error: lookupError } = await result.admin.auth.admin.getUserById(body.id);
    if (lookupError || !target.user || target.user.email?.toLowerCase() === result.ownerEmail) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }
    const { error } = await result.admin.auth.admin.updateUserById(body.id, { ban_duration: "none" });
    if (error) return NextResponse.json({ error: "Could not restore access: " + error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
