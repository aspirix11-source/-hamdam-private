"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Bell, CalendarHeart, Heart, Image as ImageIcon, LockKeyhole, LogOut, MessageCircle, Send, Sparkles, UserPlus } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type ChatMessage = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
type Conversation = { id: string; user_a: string; user_b: string; created_at: string };

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [email, setEmail] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [draft, setDraft] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<{id:string;display_name:string}[]>([]);
  const [ownerMode, setOwnerMode] = useState(false);
  const [active, setActive] = useState("Home");
  const [all, setAll] = useState(false);

  const notify = useCallback((s: string) => { setToast(s); window.setTimeout(() => setToast(""), 3200); }, []);
  const currentUser = session?.user;

  const loadConversations = useCallback(async (uid: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.from("conversations").select("id,user_a,user_b,created_at").order("created_at", { ascending: false });
    if (error) { notify("Could not load chats: " + error.message); return; }
    const rows = (data ?? []) as Conversation[];
    setConversations(rows);
    if (!activeConversation && rows[0]) setActiveConversation(rows[0].id);
    const otherIds = [...new Set(rows.map(c => c.user_a === uid ? c.user_b : c.user_a))];
    if (otherIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id,display_name").in("id", otherIds);
      setMembers((profiles ?? []) as {id:string;display_name:string}[]);
    }
  }, [activeConversation, notify]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!supabase || !conversationId) { setMessages([]); return; }
    const { data, error } = await supabase.from("messages").select("id,conversation_id,sender_id,body,created_at").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(200);
    if (error) { notify("Could not load messages: " + error.message); return; }
    setMessages((data ?? []) as ChatMessage[]);
  }, [notify]);

  useEffect(() => {
    if (!supabase) { setBooting(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setBooting(false); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUser) {
      setOwnerMode(currentUser.email?.toLowerCase() === process.env.NEXT_PUBLIC_HAMDAM_OWNER_EMAIL?.toLowerCase());
      void loadConversations(currentUser.id);
    } else { setConversations([]); setMessages([]); setMembers([]); }
  }, [currentUser?.id, loadConversations]);

  useEffect(() => { void loadMessages(activeConversation); }, [activeConversation, loadMessages]);

  useEffect(() => {
    if (!supabase || !activeConversation || !currentUser) return;
    const channel = supabase.channel("messages-" + activeConversation)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "conversation_id=eq." + activeConversation }, (payload) => {
        const row = payload.new as ChatMessage;
        setMessages(old => old.some(m => m.id === row.id) ? old : [...old, row]);
      }).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [activeConversation, currentUser?.id]);

  async function requestLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false, emailRedirectTo: window.location.origin } });
    setBusy(false);
    notify(error ? error.message : "If this email belongs to an invited account, a sign-in link is on its way.");
  }

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = draft.trim();
    if (!supabase || !currentUser || !activeConversation || !body) return;
    setBusy(true);
    const { error } = await supabase.from("messages").insert({ conversation_id: activeConversation, sender_id: currentUser.id, body });
    setBusy(false);
    if (error) { notify("Message not sent: " + error.message); return; }
    setDraft("");
    await loadMessages(activeConversation);
  }

  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail }) });
      const result = await response.json();
      notify(response.ok ? "Invitation sent to " + inviteEmail : (result.error ?? "Could not send invitation."));
      if (response.ok) setInviteEmail("");
    } catch { notify("Could not reach the invite service."); }
    setBusy(false);
  }

  async function signOut() { await supabase?.auth.signOut(); setSession(null); setActiveConversation(""); notify("Signed out."); }

  if (booting) return <main className="shell"><section className="card" style={{maxWidth:520,margin:"12vh auto",padding:32,textAlign:"center"}}><Heart color="var(--rose)" size={28}/><h1 className="serif">Opening your little world…</h1></section></main>;
  if (!supabase) return <main className="shell"><section className="card" style={{maxWidth:560,margin:"8vh auto",padding:28}}><h1 className="serif">A little setup is still needed.</h1><p>Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to Vercel Environment Variables, then redeploy.</p></section></main>;

  if (!session) return <main className="shell"><header className="topbar"><div className="brand"><div className="brand-mark"><Heart size={20} fill="currentColor"/></div><span>hamdam<span style={{color:"var(--rose)",fontWeight:500}}>.</span></span></div></header><section className="hero"><div><div className="eyebrow">Private, by invitation</div><h1 className="serif">Your favourite <span style={{color:"var(--rose)"}}>place</span> is here.</h1><p>A little corner for the people you choose.</p></div><div className="date-pill"><LockKeyhole size={14} style={{display:"inline",verticalAlign:"middle",marginRight:7}}/>Invite-only access</div></section><section className="card" style={{maxWidth:480,margin:"0 auto",padding:28}}><div className="card-head"><div><h2 className="card-title">Sign in to Hamdam</h2><p className="subtle">Use the email address that received your invitation.</p></div><Heart color="var(--rose)"/></div><form onSubmit={requestLogin} style={{display:"grid",gap:12}}><label htmlFor="email">Email address</label><input id="email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={{padding:14,borderRadius:14,border:"1px solid #e7d7d4",background:"#fffaf7",color:"#493a3c"}}/><button className="send-btn" disabled={busy} type="submit" style={{width:"100%",borderRadius:14,padding:14}}>{busy?"Sending…":"Email me a sign-in link"}</button></form><p className="subtle" style={{marginTop:16,fontSize:12}}>No public sign-up. Only invited email accounts can sign in.</p></section>{toast&&<div className="toast" role="status">{toast}</div>}</main>;

  const nav = [{label:"Home",icon:Heart},{label:"Our chat",icon:MessageCircle},{label:"Memories",icon:ImageIcon},{label:"Dates",icon:CalendarHeart}];
  const activeChat = conversations.find(c=>c.id===activeConversation);
  const otherId = activeChat ? (activeChat.user_a === currentUser?.id ? activeChat.user_b : activeChat.user_a) : "";
  const other = members.find(m=>m.id===otherId);
  return <main className="shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><Heart size={20} fill="currentColor"/></div><span>hamdam<span style={{color:"var(--rose)",fontWeight:500}}>.</span></span></div><div className="top-actions"><button className="icon-button" aria-label="Notifications" onClick={()=>notify("You’re all caught up.")}><Bell size={18}/></button><button className="avatar" aria-label="Sign out" onClick={signOut}>{currentUser?.email?.slice(0,1).toUpperCase() ?? "A"}</button></div></header>
    <section className="hero"><div><div className="eyebrow">A little corner of the world, by invitation</div><h1 className="serif">Your favourite <span style={{color:"var(--rose)"}}>place</span> is here.</h1><p>Small moments, messages, and everything you choose to share.</p></div><div className="date-pill"><Sparkles size={14} style={{display:"inline",verticalAlign:"middle",marginRight:7}}/>Signed in · {currentUser?.email}</div></section>
    {ownerMode&&<section className="card" style={{padding:18,marginBottom:18}}><div className="card-head"><div><h2 className="card-title">Invite someone</h2><p className="subtle">Only your invited email addresses can join.</p></div><UserPlus color="var(--rose)"/></div><form onSubmit={invite} style={{display:"flex",gap:10,flexWrap:"wrap"}}><input aria-label="Invite email" type="email" required value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="their@email.com" style={{flex:"1 1 200px",padding:12,borderRadius:12,border:"1px solid #e7d7d4",background:"#fffaf7",color:"#493a3c"}}/><button className="send-btn" disabled={busy} type="submit" style={{padding:"12px 18px",borderRadius:12}}>{busy?"Sending…":"Send invite"}</button></form></section>}
    <div className="grid-main"><section className="card chat-card" id="chat"><div className="card-head"><div className="chat-intro"><div className="couple-avatars"><span>{currentUser?.email?.slice(0,1).toUpperCase()}</span><span>♡</span></div><div><h2 className="card-title">{other?.display_name ?? "Your private chat"}</h2><div className="subtle" style={{marginTop:5}}><span className="online-dot"/>{conversations.length ? "One-to-one conversation" : "Your chat will appear after an invited member joins"}</div></div></div></div>
      {conversations.length>1&&<div style={{display:"flex",gap:8,padding:"0 18px 12px",flexWrap:"wrap"}}>{conversations.map(c=>{const id=c.user_a===currentUser?.id?c.user_b:c.user_a;const name=members.find(m=>m.id===id)?.display_name??"Private chat";return <button key={c.id} className="small-link" onClick={()=>setActiveConversation(c.id)} style={{fontWeight:activeConversation===c.id?700:400}}>{name}</button>})}</div>}
      <div className="chat-body" aria-live="polite">{!activeConversation?<div className="day-divider">No conversations yet · invite someone to begin</div>:messages.length===0?<div className="day-divider">Say hello · your messages are private to this conversation</div>:messages.map(m=><div className={"message-row "+(m.sender_id===currentUser?.id?"mine":"")} key={m.id}>{m.sender_id!==currentUser?.id&&<div className="avatar" style={{width:28,height:28,fontSize:10,flexShrink:0}}>♡</div>}<div><div className="message">{m.body}</div><div className="msg-time" style={{textAlign:m.sender_id===currentUser?.id?"right":"left"}}>{new Date(m.created_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</div></div></div>)}</div>
      <form className="chat-compose" onSubmit={sendMessage}><input aria-label="Write a message" value={draft} onChange={e=>setDraft(e.target.value)} placeholder={activeConversation?"Write something sweet…":"Invite a member to start chatting"} maxLength={5000} disabled={!activeConversation||busy}/><button className="send-btn" aria-label="Send message" type="submit" disabled={!activeConversation||busy}><Send size={17}/></button></form></section>
      <div className="right-stack"><section className="card" id="memories"><div className="card-head"><div><h2 className="card-title">Little time capsules</h2><p className="subtle" style={{margin:"5px 0 0"}}>The moments we want to keep</p></div><button className="small-link" onClick={()=>setAll(v=>!v)}>{all?"Show less":"See all"}</button></div><div className="memory-feature" style={{padding:20}}><div className="eyebrow">Private memories</div><h3>{all?"Photo memories are the next step.":"A place for your moments."}</h3><p>Secure photo storage will be added after chat access is working.</p></div><div className="memory-grid"><div className="memory-tile"><span>☁️</span><p>Cloud watching</p><small>Memory ideas</small></div><div className="memory-tile"><span>🌙</span><p>Late night talks</p><small>Memory ideas</small></div><div className="memory-tile"><span>🍰</span><p>Sweet little things</p><small>Memory ideas</small></div></div></section>
      <section className="card" id="dates"><div className="card-head"><div><h2 className="card-title">Dates to keep close</h2><p className="subtle" style={{margin:"5px 0 0"}}>Little days that mean a lot</p></div><CalendarHeart size={20} color="var(--rose)"/></div><div className="date-list"><p className="subtle">Shared special dates will be connected next.</p></div></section><section style={{display:"flex",alignItems:"center",gap:10,padding:"3px 5px",color:"var(--muted)",fontSize:11}}><LockKeyhole size={15} color="var(--rose)"/><span>Invite-only. Messages are visible to conversation participants.</span></section></div></div>
    <footer className="footer-note">Made of little moments and a lot of love <span style={{color:"var(--rose)"}}>♡</span></footer>
    <nav className="nav-mobile" aria-label="Main navigation">{nav.map(({label,icon:Icon})=><button key={label} className={active===label?"active":""} onClick={()=>{setActive(label);const target=label==="Our chat"?"chat":label==="Memories"?"memories":label==="Dates"?"dates":"";if(target)document.getElementById(target)?.scrollIntoView({behavior:"smooth",block:"start"});else window.scrollTo({top:0,behavior:"smooth"})}}><Icon size={19}/><span>{label}</span></button>)}</nav>
    {toast&&<div className="toast" role="status">{toast}</div>}
  </main>;
}
