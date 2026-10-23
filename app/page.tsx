"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Bell, CalendarHeart, Heart, Image as ImageIcon, LockKeyhole, MessageCircle, Send, Sparkles, UserPlus, Trash2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type ChatMessage = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
type Conversation = { id: string; user_a: string; user_b: string; created_at: string };
type Memory = { id: string; conversation_id: string; created_by: string; title: string; note: string; created_at: string };
type SpecialDate = { id: string; conversation_id: string; created_by: string; title: string; event_date: string; note: string; created_at: string };

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
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
  const [memories, setMemories] = useState<Memory[]>([]);
  const [specialDates, setSpecialDates] = useState<SpecialDate[]>([]);
  const [memoryTitle, setMemoryTitle] = useState("");
  const [memoryNote, setMemoryNote] = useState("");
  const [dateTitle, setDateTitle] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [dateNote, setDateNote] = useState("");

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
    // Supabase invitation and password-recovery links return tokens in the URL hash.
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.includes("type=invite") || hash.includes("type=recovery")) setNeedsPasswordSetup(true);
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setNeedsPasswordSetup(true);
      setSession(next); setBooting(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUser) {
      setOwnerMode(currentUser.email?.toLowerCase() === process.env.NEXT_PUBLIC_HAMDAM_OWNER_EMAIL?.toLowerCase());
      void loadConversations(currentUser.id);
    } else { setConversations([]); setMessages([]); setMembers([]); }
  }, [currentUser?.id, loadConversations]);

  useEffect(() => { void loadMessages(activeConversation); }, [activeConversation, loadMessages]);

  const loadSharedItems = useCallback(async (conversationId: string) => {
    if (!supabase || !conversationId) { setMemories([]); setSpecialDates([]); return; }
    const [memoryResult, dateResult] = await Promise.all([
      supabase.from("memories").select("id,conversation_id,created_by,title,note,created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }),
      supabase.from("special_dates").select("id,conversation_id,created_by,title,event_date,note,created_at").eq("conversation_id", conversationId).order("event_date", { ascending: true }),
    ]);
    if (memoryResult.error) notify("Memories: " + memoryResult.error.message);
    else setMemories((memoryResult.data ?? []) as Memory[]);
    if (dateResult.error) notify("Dates: " + dateResult.error.message);
    else setSpecialDates((dateResult.data ?? []) as SpecialDate[]);
  }, [notify]);

  useEffect(() => { void loadSharedItems(activeConversation); }, [activeConversation, loadSharedItems]);

  async function saveMemory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || !currentUser || !activeConversation || !memoryTitle.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("memories").insert({
      conversation_id: activeConversation, created_by: currentUser.id,
      title: memoryTitle.trim(), note: memoryNote.trim()
    });
    setBusy(false);
    if (error) { notify("Could not save memory: " + error.message); return; }
    setMemoryTitle(""); setMemoryNote("");
    await loadSharedItems(activeConversation);
    notify("Memory saved for both of you.");
  }

  async function saveSpecialDate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || !currentUser || !activeConversation || !dateTitle.trim() || !dateValue) return;
    setBusy(true);
    const { error } = await supabase.from("special_dates").insert({
      conversation_id: activeConversation, created_by: currentUser.id,
      title: dateTitle.trim(), event_date: dateValue, note: dateNote.trim()
    });
    setBusy(false);
    if (error) { notify("Could not save date: " + error.message); return; }
    setDateTitle(""); setDateValue(""); setDateNote("");
    await loadSharedItems(activeConversation);
    notify("Special date saved.");
  }

  async function deleteMemory(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from("memories").delete().eq("id", id);
    if (error) { notify("Could not delete memory: " + error.message); return; }
    await loadSharedItems(activeConversation);
  }

  async function deleteSpecialDate(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from("special_dates").delete().eq("id", id);
    if (error) { notify("Could not delete date: " + error.message); return; }
    await loadSharedItems(activeConversation);
  }

  useEffect(() => {
    if (!supabase || !activeConversation || !currentUser) return;
    const channel = supabase.channel("messages-" + activeConversation)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "conversation_id=eq." + activeConversation }, (payload) => {
        const row = payload.new as ChatMessage;
        setMessages(old => old.some(m => m.id === row.id) ? old : [...old, row]);
      }).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [activeConversation, currentUser?.id]);

  async function setAccountPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    if (password.length < 8) { notify("Use at least 8 characters for your password."); return; }
    if (password !== confirmPassword) { notify("The passwords do not match."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { notify("Could not set password: " + error.message); return; }
    setPassword(""); setConfirmPassword(""); setNeedsPasswordSetup(false);
    window.history.replaceState({}, document.title, window.location.pathname);
    notify("Password set. You can now sign in with email and password.");
    await supabase.auth.signOut();
    setSession(null);
  }

  async function requestLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (error) {
      notify(error.message.includes("Invalid login credentials")
        ? "Email or password is incorrect. Set the account password in Supabase Auth first."
        : error.message);
      return;
    }
    notify("Signed in successfully.");
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
    if (!supabase) return;
    setBusy(true);
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) {
        notify("Your session expired. Sign in again.");
        setBusy(false);
        return;
      }
      const response = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentSession.access_token }, body: JSON.stringify({ email: inviteEmail }) });
      const result = await response.json();
      notify(response.ok ? "Invitation sent to " + inviteEmail : (result.error ?? "Could not send invitation."));
      if (response.ok) setInviteEmail("");
    } catch { notify("Could not reach the invite service."); }
    setBusy(false);
  }

  async function signOut() { await supabase?.auth.signOut(); setSession(null); setActiveConversation(""); notify("Signed out."); }

  if (booting) return <main className="shell"><section className="card" style={{maxWidth:520,margin:"12vh auto",padding:32,textAlign:"center"}}><Heart color="var(--rose)" size={28}/><h1 className="serif">Opening your little world…</h1></section></main>;
  if (!supabase) return <main className="shell"><section className="card" style={{maxWidth:560,margin:"8vh auto",padding:28}}><h1 className="serif">A little setup is still needed.</h1><p>Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to Vercel Environment Variables, then redeploy.</p></section></main>;

  if (needsPasswordSetup) return <main className="shell"><header className="topbar"><div className="brand"><div className="brand-mark"><Heart size={20} fill="currentColor"/></div><span>hamdam<span style={{color:"var(--rose)",fontWeight:500}}>.</span></span></div></header><section className="card" style={{maxWidth:480,margin:"8vh auto",padding:28}}><div className="card-head"><div><h2 className="card-title">Set your Hamdam password</h2><p className="subtle">Choose a password to use whenever you sign in.</p></div><LockKeyhole color="var(--rose)"/></div><form onSubmit={setAccountPassword} style={{display:"grid",gap:12}}><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" style={{padding:14,borderRadius:14,border:"1px solid #e7d7d4",background:"#fffaf7",color:"#493a3c"}}/><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Enter it again" style={{padding:14,borderRadius:14,border:"1px solid #e7d7d4",background:"#fffaf7",color:"#493a3c"}}/><button className="send-btn" disabled={busy} type="submit" style={{width:"100%",borderRadius:14,padding:14}}>{busy?"Saving password…":"Set password"}</button></form>{toast&&<div className="toast" role="status">{toast}</div>}</section></main>;

  if (!session) return <main className="shell"><header className="topbar"><div className="brand"><div className="brand-mark"><Heart size={20} fill="currentColor"/></div><span>hamdam<span style={{color:"var(--rose)",fontWeight:500}}>.</span></span></div></header><section className="hero"><div><div className="eyebrow">Restricted system</div><h1 className="serif">ACCESS <span style={{color:"var(--rose)"}}>DENIED</span></h1><p>This private space is not available to you.</p></div><div className="date-pill"><LockKeyhole size={14} style={{display:"inline",verticalAlign:"middle",marginRight:7}}/>PRIVATE AREA · AUTHORIZED USERS ONLY</div></section><section className="card" style={{maxWidth:480,margin:"0 auto",padding:28}}><div className="card-head"><div><h2 className="card-title">Restricted area</h2><p className="subtle">Unauthorized access is not permitted.</p></div><Heart color="var(--rose)"/></div><button type="button" className="send-btn" onClick={()=>setShowLogin(v=>!v)} style={{width:"100%",borderRadius:14,padding:14,marginBottom:12}}>{showLogin?"Hide sign in":"Authorized member? Continue"}</button>{showLogin && <form onSubmit={requestLogin} style={{display:"grid",gap:12}}><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={{padding:14,borderRadius:14,border:"1px solid #e7d7d4",background:"#fffaf7",color:"#493a3c"}}/><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" style={{padding:14,borderRadius:14,border:"1px solid #e7d7d4",background:"#fffaf7",color:"#493a3c"}}/><button className="send-btn" disabled={busy} type="submit" style={{width:"100%",borderRadius:14,padding:14}}>{busy?"Signing in…":"Sign in"}</button></form>}<p className="subtle" style={{marginTop:16,fontSize:12}}>Private system. Access is restricted to invited accounts.</p></section>{toast&&<div className="toast" role="status">{toast}</div>}</main>;

  const nav = [{label:"Home",icon:Heart},{label:"Chat",icon:MessageCircle},{label:"Calls",icon:Bell},{label:"Memories",icon:ImageIcon},{label:"Dates",icon:CalendarHeart},{label:"Settings",icon:LockKeyhole}];
  const activeChat = conversations.find(c=>c.id===activeConversation);
  const otherId = activeChat ? (activeChat.user_a === currentUser?.id ? activeChat.user_b : activeChat.user_a) : "";
  const other = members.find(m=>m.id===otherId);
  return <main className="shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><Heart size={20} fill="currentColor"/></div><span>hamdam<span style={{color:"var(--rose)",fontWeight:500}}>.</span></span></div><div className="top-actions"><button className="icon-button" aria-label="Notifications" onClick={()=>notify("You’re all caught up.")}><Bell size={18}/></button><button className="avatar" aria-label="Sign out" onClick={signOut}>{currentUser?.email?.slice(0,1).toUpperCase() ?? "A"}</button></div></header>
    <section className="hero"><div><div className="eyebrow">A little corner of the world, by invitation</div><h1 className="serif">Your favourite <span style={{color:"var(--rose)"}}>place</span> is here.</h1><p>Small moments, messages, and everything you choose to share.</p></div><div className="date-pill"><Sparkles size={14} style={{display:"inline",verticalAlign:"middle",marginRight:7}}/>Signed in · {currentUser?.email}</div></section>
    {ownerMode&&<section className="card" style={{padding:18,marginBottom:18}}><div className="card-head"><div><h2 className="card-title">Invite someone</h2><p className="subtle">Only your invited email addresses can join.</p></div><UserPlus color="var(--rose)"/></div><form onSubmit={invite} style={{display:"flex",gap:10,flexWrap:"wrap"}}><input aria-label="Invite email" type="email" required value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="their@email.com" style={{flex:"1 1 200px",padding:12,borderRadius:12,border:"1px solid #e7d7d4",background:"#fffaf7",color:"#493a3c"}}/><button className="send-btn" disabled={busy} type="submit" style={{padding:"12px 18px",borderRadius:12}}>{busy?"Sending…":"Send invite"}</button></form></section>}
    <div className="grid-main"><section className="card chat-card" id="chat" style={{display:active==="Home"||active==="Chat"?"flex":"none"}}><div className="card-head"><div className="chat-intro"><div className="couple-avatars"><span>{currentUser?.email?.slice(0,1).toUpperCase()}</span><span>♡</span></div><div><h2 className="card-title">{other?.display_name ?? "Your private chat"}</h2><div className="subtle" style={{marginTop:5}}><span className="online-dot"/>{conversations.length ? "One-to-one conversation" : "Your chat will appear after an invited member joins"}</div></div></div></div>
      {conversations.length>1&&<div style={{display:"flex",gap:8,padding:"0 18px 12px",flexWrap:"wrap"}}>{conversations.map(c=>{const id=c.user_a===currentUser?.id?c.user_b:c.user_a;const name=members.find(m=>m.id===id)?.display_name??"Private chat";return <button key={c.id} className="small-link" onClick={()=>setActiveConversation(c.id)} style={{fontWeight:activeConversation===c.id?700:400}}>{name}</button>})}</div>}
      <div className="chat-body" aria-live="polite">{!activeConversation?<div className="day-divider">No conversations yet · invite someone to begin</div>:messages.length===0?<div className="day-divider">Say hello · your messages are private to this conversation</div>:messages.map(m=><div className={"message-row "+(m.sender_id===currentUser?.id?"mine":"")} key={m.id}>{m.sender_id!==currentUser?.id&&<div className="avatar" style={{width:28,height:28,fontSize:10,flexShrink:0}}>♡</div>}<div><div className="message">{m.body}</div><div className="msg-time" style={{textAlign:m.sender_id===currentUser?.id?"right":"left"}}>{new Date(m.created_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</div></div></div>)}</div>
      <form className="chat-compose" onSubmit={sendMessage}><input aria-label="Write a message" value={draft} onChange={e=>setDraft(e.target.value)} placeholder={activeConversation?"Write something sweet…":"Invite a member to start chatting"} maxLength={5000} disabled={!activeConversation||busy}/><button className="send-btn" aria-label="Send message" type="submit" disabled={!activeConversation||busy}><Send size={17}/></button></form></section>
      <div className="right-stack"><section className="card" id="settings" style={{display:active==="Settings"?"block":"none"}}><div className="card-head"><div><h2 className="card-title">Settings & Privacy</h2><p className="subtle">Your private Hamdam account</p></div><LockKeyhole color="var(--rose)"/></div><div style={{padding:20,display:"grid",gap:12}}><p className="subtle">Only use Hamdam with your invited account. Keep your password private and sign out on shared devices.</p><button type="button" className="send-btn" onClick={()=>void signOut()} style={{width:"100%",padding:13}}>Sign out</button></div></section><section className="card" id="calls" style={{display:active==="Calls"?"block":"none"}}><div className="card-head"><div><h2 className="card-title">Calls</h2><p className="subtle">Voice and video calling</p></div><Bell color="var(--rose)"/></div><div style={{padding:20}}><p className="subtle">Calling is not active yet. Real-time signaling, WebRTC connection handling, microphone/camera permissions and network relay must be implemented and tested before calls can work.</p></div></section><section className="card" id="memories" style={{display:active==="Home"||active==="Memories"?"block":"none"}}><div className="card-head"><div><h2 className="card-title">Little time capsules</h2><p className="subtle" style={{margin:"5px 0 0"}}>Shared memories saved to your private chat</p></div><ImageIcon size={20} color="var(--rose)"/></div>
      {!activeConversation?<p className="subtle">Invite someone to unlock shared memories.</p>:<form onSubmit={saveMemory} style={{display:"grid",gap:9,marginBottom:16}}><input aria-label="Memory title" required maxLength={120} value={memoryTitle} onChange={e=>setMemoryTitle(e.target.value)} placeholder="Memory title" style={{padding:12,borderRadius:12,border:"1px solid #e7d7d4",background:"#fffaf7",color:"#493a3c"}}/><textarea aria-label="Memory note" maxLength={2000} value={memoryNote} onChange={e=>setMemoryNote(e.target.value)} placeholder="What do you want to remember?" rows={3} style={{padding:12,borderRadius:12,border:"1px solid #e7d7d4",background:"#fffaf7",color:"#493a3c"}}/><button className="send-btn" type="submit" disabled={busy} style={{padding:12,borderRadius:12}}>Save memory</button></form>}
      <div style={{display:"grid",gap:10}}>{memories.length===0?<p className="subtle">No saved memories yet. Add your first one above.</p>:memories.map(m=><article key={m.id} className="memory-feature" style={{padding:16}}><div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"start"}}><div><h3 style={{margin:"0 0 6px"}}>{m.title}</h3>{m.note&&<p style={{margin:0,whiteSpace:"pre-wrap"}}>{m.note}</p>}<small className="subtle">{new Date(m.created_at).toLocaleDateString()}</small></div><button className="small-link" aria-label="Delete memory" onClick={()=>void deleteMemory(m.id)}><Trash2 size={16}/></button></div></article>)}</div></section>
      <section className="card" id="dates" style={{display:active==="Home"||active==="Dates"?"block":"none"}}><div className="card-head"><div><h2 className="card-title">Dates to keep close</h2><p className="subtle" style={{margin:"5px 0 0"}}>Shared anniversaries and important days</p></div><CalendarHeart size={20} color="var(--rose)"/></div>
      {!activeConversation?<p className="subtle">Invite someone to add shared dates.</p>:<form onSubmit={saveSpecialDate} style={{display:"grid",gap:9,marginBottom:16}}><input aria-label="Date title" required maxLength={120} value={dateTitle} onChange={e=>setDateTitle(e.target.value)} placeholder="What is the day?" style={{padding:12,borderRadius:12,border:"1px solid #e7d7d4",background:"#fffaf7",color:"#493a3c"}}/><input aria-label="Special date" type="date" required value={dateValue} onChange={e=>setDateValue(e.target.value)} style={{padding:12,borderRadius:12,border:"1px solid #e7d7d4",background:"#fffaf7",color:"#493a3c"}}/><input aria-label="Date note" maxLength={500} value={dateNote} onChange={e=>setDateNote(e.target.value)} placeholder="A little note (optional)" style={{padding:12,borderRadius:12,border:"1px solid #e7d7d4",background:"#fffaf7",color:"#493a3c"}}/><button className="send-btn" type="submit" disabled={busy} style={{padding:12,borderRadius:12}}>Save special date</button></form>}
      <div className="date-list">{specialDates.length===0?<p className="subtle">No dates saved yet.</p>:specialDates.map(d=><article key={d.id} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"12px 0",borderBottom:"1px solid #f0e2df"}}><div><strong>{d.title}</strong><p className="subtle" style={{margin:"4px 0"}}>{new Date(d.event_date+"T12:00:00").toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"})}</p>{d.note&&<p style={{margin:0}}>{d.note}</p>}</div><button className="small-link" aria-label="Delete special date" onClick={()=>void deleteSpecialDate(d.id)}><Trash2 size={16}/></button></article>)}</div></section><section style={{display:"flex",alignItems:"center",gap:10,padding:"3px 5px",color:"var(--muted)",fontSize:11}}><LockKeyhole size={15} color="var(--rose)"/><span>Invite-only. Messages are visible to conversation participants.</span></section></div></div>
    <footer className="footer-note">Made of little moments and a lot of love <span style={{color:"var(--rose)"}}>♡</span></footer>
    <nav className="nav-mobile" aria-label="Main navigation">{nav.map(({label,icon:Icon})=><button key={label} className={active===label?"active":""} onClick={()=>{setActive(label);const target=label==="Chat"?"chat":label==="Calls"?"calls":label==="Memories"?"memories":label==="Dates"?"dates":label==="Settings"?"settings":"";if(target)document.getElementById(target)?.scrollIntoView({behavior:"smooth",block:"start"});else window.scrollTo({top:0,behavior:"smooth"})}}><Icon size={19}/><span>{label}</span></button>)}</nav>
    {toast&&<div className="toast" role="status">{toast}</div>}
  </main>;
}
