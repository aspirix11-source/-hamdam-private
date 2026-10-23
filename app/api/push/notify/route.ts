import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@hamdam-private.vercel.app";
  if (!url || !anon || !serviceKey || !publicKey || !privateKey) {
    return NextResponse.json({ error: "Push notifications are not configured on the server yet." }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Session is invalid." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
  const type = body?.type === "call" ? "call" : "message";
  const message = typeof body?.message === "string" ? body.message.slice(0, 140) : "";
  if (!conversationId) return NextResponse.json({ error: "Conversation is required." }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: conversation, error: conversationError } = await admin.from("conversations").select("id,user_a,user_b").eq("id", conversationId).maybeSingle();
  if (conversationError || !conversation || ![conversation.user_a, conversation.user_b].includes(user.id)) {
    return NextResponse.json({ error: "Conversation not found or access denied." }, { status: 403 });
  }
  const recipientId = conversation.user_a === user.id ? conversation.user_b : conversation.user_a;
  const { data: subscriptions, error: subscriptionsError } = await admin.from("push_subscriptions").select("subscription,endpoint").eq("user_id", recipientId);
  if (subscriptionsError) return NextResponse.json({ error: "Could not load notification subscriptions." }, { status: 500 });
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const payload = JSON.stringify({
    title: type === "call" ? "Incoming Hamdam call" : "New message on Hamdam",
    body: type === "call" ? "Someone is calling you. Open Hamdam to answer." : (message || "You have a new message"),
    type,
    tag: type === "call" ? "hamdam-incoming-call" : "hamdam-new-message",
    conversationId,
    url: "/"
  });
  const results = await Promise.all((subscriptions ?? []).map(async item => {
    try {
      await webpush.sendNotification(item.subscription, payload, { TTL: type === "call" ? 30 : 3600 });
      return true;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("endpoint", item.endpoint);
      return false;
    }
  }));
  return NextResponse.json({ ok: true, delivered: results.filter(Boolean).length });
}
