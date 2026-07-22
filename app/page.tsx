"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type InboxMessage = { id: number; type: string; payload: string };
type VoterData = {
  authorized?: boolean;
  roll_number?: string;
  name?: string;
  email?: string;
  gender?: string;
  has_voted?: boolean;
  inbox?: InboxMessage[];
  locked_nominations?: { role: string; nominee_name: string }[];
  is_admin?: boolean;
};

type LeaderboardRow = { name: string; votes: number };

type ElectionResult = {
  nominee_name: string | null;
  status: "pending" | "accepted" | "denied" | "unmatched" | "no_votes";
  note?: string | null;
};

type LeaderboardData = {
  is_results_open: boolean;
  is_voting_active: boolean;
  leaderboard: { CR: LeaderboardRow[]; GR: LeaderboardRow[] };
  results: Record<string, ElectionResult>;
  kill_switch_engaged?: boolean;
  permanently_locked?: boolean;
};

const ADMIN_EMAIL = "pushkar_ramteke_aids@moderncoe.edu.in";
const API = " https://lint-penpal-antihero.ngrok-free.dev";

export default function PlatformDashboard() {
  const { data: session, status } = useSession();

  const [activeTab, setActiveTab] = useState<"terminal" | "inbox" | "leaderboard">("terminal");
  const [voterData, setVoterData] = useState<VoterData | null>(null);
  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [activeEmail, setActiveEmail] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [krodh, setKrodh] = useState(0);
  const [draft, setDraft] = useState({ CR: "Pushkar Ramteke", GR: "Shraddha Unhale" });
  const [showLetter, setShowLetter] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [allVoters, setAllVoters] = useState<any[]>([]);
  const [panelNote, setPanelNote] = useState<string>("Ready");
  const [killSwitchBusy, setKillSwitchBusy] = useState(false);
  const [confirmingSwitch, setConfirmingSwitch] = useState<"on" | "off" | null>(null);
  const [killSwitchError, setKillSwitchError] = useState<string | null>(null);

  const isAdmin = activeEmail === ADMIN_EMAIL;
  const displayName = useMemo(() => voterData?.name || activeEmail || "Guest", [voterData?.name, activeEmail]);
  const hasVoted = !!voterData?.has_voted;
  const leaderboardOpen = !!leaderboard?.is_results_open;

  const crResult = leaderboard?.results?.CR;
  const grResult = leaderboard?.results?.GR;
  
  const crConfirmed = crResult?.status === "accepted";
  const grConfirmed = grResult?.status === "accepted";
  const anySeatConfirmed = crConfirmed || grConfirmed;
  
  const votingIsClosed = leaderboard?.is_voting_active === false;
  
  const killSwitchEngaged = !!leaderboard?.kill_switch_engaged;
  const killSwitchPermanentlyLocked = !!leaderboard?.permanently_locked;

  const describeResult = (result?: ElectionResult) => {
    if (!result) return { label: "Awaiting consent", tone: "neutral" as const, note: null as string | null | undefined };
    switch (result.status) {
      case "accepted":
        return { label: `${result.nominee_name} confirmed`, tone: "positive" as const, note: null };
      case "denied":
        return { label: `${result.nominee_name} declined — voting reopened for this role`, tone: "negative" as const, note: null };
      case "unmatched":
        return { label: "Consent request couldn't be delivered", tone: "negative" as const, note: result.note };
      case "no_votes":
        return { label: "No nominations recorded yet", tone: "neutral" as const, note: result.note };
      case "pending":
      default:
        return {
          label: result.nominee_name ? `Awaiting consent from ${result.nominee_name}` : "Awaiting consent",
          tone: "neutral" as const,
          note: null,
        };
    }
  };

  useEffect(() => {
    const userEmail = session?.user?.email || ADMIN_EMAIL;
    const override = typeof window !== "undefined" ? localStorage.getItem("dev_override_email") : null;
    const emailToUse = override || userEmail;
    setActiveEmail(emailToUse);
    fetchVoterStatus(emailToUse);
    fetchLeaderboard();
  }, [session]);

  const fetchVoterStatus = async (email: string) => {
    try {
      setPanelNote("Syncing account...");
      const res = await fetch(`${API}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setVoterData(data);
      setInbox(data.inbox || []);

      if (data.has_voted) {
        const saved = localStorage.getItem(`gossip_history_${email}`);
        if (saved) {
          setHistory(JSON.parse(saved));
        } else {
          setHistory([
            {
              role: "system",
              content:
                "You are a casual post-election Gossip Bot. The user has already voted. Chat about college, tech, or movies. NEVER output [VERIFY] or [UPDATE_DRAFT] tags. Keep it fun and light.",
            },
            {
              role: "assistant",
              content: "Hey! Looks like you already locked in your vote. What's the latest campus gossip? 🍿",
            },
          ]);
        }
        setPanelNote("Gossip mode active");
      } else {
        const locked = data.locked_nominations || [];
        const cr = locked.find((x: any) => x.role === "CR")?.nominee_name || "Pushkar Ramteke";
        const gr = locked.find((x: any) => x.role === "GR")?.nominee_name || "Shraddha Unhale";
        setDraft({ CR: cr, GR: gr });

        setHistory([
          {
            role: "system",
            content: `You are a concise College Election Host. Current draft: CR = ${cr}, GR = ${gr}. 
            GOALS: Help user update or confirm CR and GR. 
            RULES: 
            1. When user proposes a name change for a specific role, output ONLY: [VERIFY: Name, Role]. Do NOT repeat verification if already verified in this turn.
            2. Once the system matches a name, output: [UPDATE_DRAFT: Role, Full Name].
            3. Keep replies short, clear, and direct. Avoid repeating previous text. End messages with [KRODH: X] (0-100).`,
          },
          {
            role: "assistant",
            content: `Current draft is CR = ${cr}, GR = ${gr}. Are we keeping this ticket or changing anyone? [KRODH: 0]`,
          },
        ]);
        setPanelNote("Ballot drafting active");
      }
    } catch (e) {
      setPanelNote("Auth sync failed");
      console.error("Auth Error", e);
    }
  };

  const fetchAllVoters = async () => {
    try {
      const res = await fetch(`${API}/api/admin/voters`);
      const data = await res.json();
      setAllVoters(data.voters || []);
    } catch (e) {
      console.error("Failed to fetch voters", e);
    }
  };

  const handleImpersonate = (targetEmail: string) => {
    if (!targetEmail) return;
    localStorage.setItem("dev_override_email", targetEmail);
    window.location.reload();
  };

  const handleSignOut = async () => {
    localStorage.removeItem("dev_override_email");
    setActiveEmail(null);
    await signOut({ callbackUrl: "/" });
  };

  const sendMessage = async () => {
    if (!message.trim()) return;
    setLoading(true);
    const updatedHistory = [...history, { role: "user", content: message }];
    setHistory(updatedHistory);
    setMessage("");

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: updatedHistory }),
      });
      const data = await res.json();
      let botResponse = data.content || "";

      const krodhMatch = botResponse.match(/\[KRODH:\s*(\d+)\]/);
      if (krodhMatch) {
        setKrodh(parseInt(krodhMatch[1]));
        botResponse = botResponse.replace(krodhMatch[0], "").trim();
      }

      // 1. Intercept VERIFY
      const verifyRegex = /\[VERIFY:\s*"?([^",]+)"?,\s*"?([^"\]]+)"?\]/g;
      let verifyMatch;
      while ((verifyMatch = verifyRegex.exec(botResponse)) !== null) {
        const nomineeInput = verifyMatch[1].trim();
        const roleInput = verifyMatch[2].trim();

        const verifyRes = await fetch(`${API}/api/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nominee: nomineeInput, role: roleInput }),
        });
        const verifyData = await verifyRes.json();
        
        botResponse = botResponse.replace(verifyMatch[0], `\n\n[SYSTEM: ${verifyData.message}]\n`).trim();

        if (verifyData.matched_name) {
          setDraft((prev) => ({ ...prev, [roleInput.toUpperCase()]: verifyData.matched_name }));
        }
      }

      // 2. Intercept UPDATE_DRAFT
      const updateRegex = /\[UPDATE_DRAFT:\s*"?([^",]+)"?,\s*"?([^"\]]+)"?\]/g;
      let updateMatch;
      while ((updateMatch = updateRegex.exec(botResponse)) !== null) {
        const role = updateMatch[1].trim().toUpperCase();
        const name = updateMatch[2].trim();
        setDraft((prev) => ({ ...prev, [role]: name }));
        botResponse = botResponse.replace(updateMatch[0], "").trim();
      }

      if (botResponse.includes("[SHOW_LETTER]")) {
        botResponse = botResponse.replace("[SHOW_LETTER]", "").trim();
        setShowLetter(true);
      }

      const finalHistory = [...updatedHistory, { role: "assistant", content: botResponse.trim() }];
      setHistory(finalHistory);
    } catch (error) {
      console.error("Chat Error", error);
    } finally {
      setLoading(false);
    }
  };

  const submitFinalVote = async () => {
    if (votingIsClosed) {
      setPanelNote("Voting is closed — kill switch is engaged");
      return;
    }
    await fetch(`${API}/api/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voter_email: activeEmail, cr_nominee: draft.CR, gr_nominee: draft.GR }),
    });
    setPanelNote("Vote locked successfully");
    window.location.reload();
  };

  const handleKillSwitch = async (action: "on" | "off") => {
    setKillSwitchBusy(true);
    setKillSwitchError(null);
    try {
      const res = await fetch(`${API}/api/admin/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_email: session?.user?.email, action }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setKillSwitchError(data?.detail || "Couldn't update the kill switch.");
        return;
      }

      setPanelNote(action === "on" ? "Kill switch engaged — voting stopped" : "Kill switch disengaged — voting resumed");
      await Promise.all([fetchLeaderboard(), fetchVoterStatus(activeEmail || ADMIN_EMAIL)]);
    } catch (e) {
      console.error("Kill switch toggle failed", e);
      setKillSwitchError("Couldn't reach the server — try again.");
    } finally {
      setKillSwitchBusy(false);
      setConfirmingSwitch(null);
    }
  };

  const fetchLeaderboard = async () => {
    const res = await fetch(`${API}/api/leaderboard`);
    const data = await res.json();
    setLeaderboard(data);
  };

  const respondToInbox = async (msgId: number, responseType: "ACCEPT" | "DENY") => {
    try {
      const res = await fetch(`${API}/api/inbox/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roll_number: voterData?.roll_number, message_id: msgId, response: responseType }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      setPanelNote(
        responseType === "ACCEPT" ? "Consent accepted — seat confirmed" : "Consent declined — reopening voting"
      );

      await Promise.all([fetchVoterStatus(activeEmail || ADMIN_EMAIL), fetchLeaderboard()]);
    } catch (e) {
      console.error("Inbox response failed", e);
      setPanelNote("Couldn't reach server — try again");
    }
  };

  useEffect(() => {
    if (isAdmin && activeTab === "leaderboard") fetchAllVoters();
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (activeTab === "leaderboard") fetchLeaderboard();
  }, [activeTab]);

  const handlePreview = () => {
    setShowLetter(true);
  };

  if (status === "loading" || !activeEmail) {
    return (
      <main className="min-h-screen grid place-items-center bg-[radial-gradient(circle_at_top,_#fff7ec,_#f5efe7_60%,_#ede6dd)] text-neutral-500">
        <div className="rounded-full border border-white bg-white/70 px-5 py-3 text-[11px] uppercase tracking-[0.35em] shadow-sm">
          Initializing System...
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen grid place-items-center bg-[radial-gradient(circle_at_top,_#fff7ec,_#f5efe7_60%,_#ede6dd)] px-4">
        <div className="w-full max-w-md rounded-[32px] border border-white/70 bg-white/65 p-8 shadow-[0_30px_90px_-30px_rgba(91,70,45,0.35)] backdrop-blur-xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.35em] text-neutral-400">Election Terminal</p>
              <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Secure access required</h1>
            </div>
            <div className="rounded-full bg-gradient-to-br from-amber-200 to-rose-200 p-3 text-xl shadow-sm">◌</div>
          </div>
          <button
            onClick={() => signIn("google")}
            className="w-full rounded-full bg-[#f2a9a1] py-3.5 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-[#ef978e]"
          >
            Enter with Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ec,_#f5efe7_60%,_#ede6dd)] px-4 py-5 text-neutral-800">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="rounded-[28px] border border-white/70 bg-white/55 px-5 py-4 shadow-[0_20px_60px_-25px_rgba(91,70,45,0.3)] backdrop-blur-xl md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f6d9a8] to-[#f4a9a0] text-lg font-bold text-neutral-900 shadow-sm">
                E
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-neutral-400">Platform Dashboard</p>
                <h2 className="text-lg font-semibold text-neutral-900">{displayName}</h2>
                <p className="text-xs text-neutral-500">
                  {activeEmail} · {panelNote}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span
                className={`rounded-full px-3 py-1.5 font-medium ${
                  hasVoted ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {hasVoted ? "Vote locked" : "Draft in progress"}
              </span>
              <div className="min-w-[170px] rounded-full bg-white px-3 py-2 shadow-sm">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-neutral-400">
                  <span>Rage Meter</span>
                  <span>{Math.min(100, Math.max(0, krodh))}%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, krodh))}%` }}
                  />
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="rounded-full border border-neutral-200 bg-white px-4 py-2 font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-red-500"
              >
                Sign out
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["terminal", "Terminal"],
              ["inbox", `Inbox ${inbox.length ? `(${inbox.length})` : ""}`],
              ["leaderboard", isAdmin ? "Admin Control" : "Leaderboard"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as any)}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                  activeTab === key ? "bg-neutral-900 text-white shadow-sm" : "bg-white/75 text-neutral-500 hover:bg-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {activeTab === "inbox" && (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[28px] border border-white/70 bg-white/60 p-6 shadow-[0_20px_60px_-25px_rgba(91,70,45,0.25)] backdrop-blur-xl">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-neutral-500">Secure Inbox</h3>
              <div className="mt-5 space-y-3">
                {inbox.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/70 p-6 text-sm text-neutral-400">
                    No new messages.
                  </div>
                ) : (
                  inbox.map((msg) => {
                    let parsedPayload: any = {};
                    try {
                      parsedPayload = JSON.parse(msg.payload);
                    } catch {
                      parsedPayload = { message: msg.payload };
                    }
                    return (
                      <article key={msg.id} className="rounded-[24px] border border-neutral-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-rose-500">
                            {msg.type.replace("_", " ")} {parsedPayload.role ? `· ${parsedPayload.role}` : ""}
                          </span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                          {parsedPayload.message || msg.payload}
                        </p>
                        {msg.type === "consent_request" && (
                          <div className="mt-4 flex gap-3">
                            <button
                              onClick={() => respondToInbox(msg.id, "ACCEPT")}
                              className="flex-1 rounded-full bg-emerald-500 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-emerald-600"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => respondToInbox(msg.id, "DENY")}
                              className="flex-1 rounded-full bg-rose-500 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-rose-600"
                          >
                            Deny & Revote
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/70 bg-white/60 p-6 shadow-[0_20px_60px_-25px_rgba(91,70,45,0.25)] backdrop-blur-xl">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-neutral-500">Election Status</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-3xl bg-white p-4 shadow-sm">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-neutral-400">Role</p>
                  <p className="mt-2 text-lg font-semibold text-neutral-900">{hasVoted ? "Post-vote mode" : "Draft mode"}</p>
                </div>
                <div className="rounded-3xl bg-white p-4 shadow-sm">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-neutral-400">CR</p>
                  <p className="mt-2 text-lg font-semibold text-neutral-900">{draft.CR}</p>
                </div>
                <div className="rounded-3xl bg-white p-4 shadow-sm">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-neutral-400">GR</p>
                  <p className="mt-2 text-lg font-semibold text-neutral-900">{draft.GR}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "leaderboard" && (
          <section className="space-y-5">
            {!leaderboardOpen && !isAdmin ? (
              <div className="rounded-[28px] border border-white/70 bg-white/60 p-12 text-center shadow-[0_20px_60px_-25px_rgba(91,70,45,0.25)] backdrop-blur-xl">
                <h3 className="text-2xl font-semibold text-neutral-900">Results are hidden</h3>
              </div>
            ) : (
              <>
                {killSwitchEngaged && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {(
                      [
                        ["Class Representative", crResult],
                        ["Girls Representative", grResult],
                      ] as const
                    ).map(([label, result]) => {
                      const info = describeResult(result);
                      const toneClass =
                        info.tone === "positive"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : info.tone === "negative"
                          ? "border-rose-200 bg-rose-50 text-rose-900"
                          : "border-neutral-200 bg-white text-neutral-500";
                      return (
                        <div key={label} className={`rounded-2xl border px-5 py-4 text-sm ${toneClass}`}>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.25em]">{label}</p>
                          <p className="mt-1 font-medium">{info.label}</p>
                          {info.note && <p className="mt-1 text-xs opacity-80">{info.note}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {isAdmin && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div
                      className={`rounded-[28px] border p-6 shadow-sm transition-colors ${
                        killSwitchEngaged
                          ? "border-rose-200 bg-gradient-to-br from-rose-50 to-white"
                          : "border-amber-200 bg-gradient-to-br from-amber-100 to-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-semibold text-neutral-900">Kill switch</h3>
                          <p className="mt-1 text-xs text-neutral-500">
                            {killSwitchEngaged
                              ? "Voting is stopped. Leaderboard is public. Winners have been sent consent requests."
                              : "Voting is live. Leaderboard is hidden from students."}
                          </p>
                        </div>

                        {/* The literal switch */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={killSwitchEngaged}
                          disabled={killSwitchBusy || (killSwitchEngaged && killSwitchPermanentlyLocked)}
                          onClick={() => setConfirmingSwitch(killSwitchEngaged ? "off" : "on")}
                          className={`relative h-9 w-16 shrink-0 rounded-full transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                            killSwitchEngaged ? "bg-rose-500" : "bg-neutral-300"
                          }`}
                        >
                          <span
                            className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow-md transition-transform duration-300 ${
                              killSwitchEngaged ? "translate-x-8" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>

                      <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em]">
                        <span className={`h-2 w-2 rounded-full ${killSwitchEngaged ? "bg-rose-500" : "bg-emerald-500"}`} />
                        <span className={killSwitchEngaged ? "text-rose-600" : "text-emerald-600"}>
                          {killSwitchEngaged ? "Engaged" : "Standing down"}
                        </span>
                      </div>

                      {killSwitchEngaged && killSwitchPermanentlyLocked && (
                        <p className="mt-3 text-[11px] text-neutral-500">
                          A result was accepted — this is now permanently locked and can't be switched off.
                        </p>
                      )}

                      {killSwitchError && <p className="mt-3 text-[11px] font-medium text-rose-600">{killSwitchError}</p>}

                      {/* Inline confirm step */}
                      {confirmingSwitch && (
                        <div className="mt-4 rounded-2xl border border-neutral-200 bg-white/90 p-4">
                          <p className="text-xs text-neutral-600">
                            {confirmingSwitch === "on"
                              ? "This stops all voting immediately, opens the leaderboard to everyone, and sends consent requests to the current CR and GR frontrunners. Continue?"
                              : "This resumes normal voting and hides the leaderboard again. Continue?"}
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => handleKillSwitch(confirmingSwitch)}
                              disabled={killSwitchBusy}
                              className={`flex-1 rounded-full px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition disabled:opacity-60 ${
                                confirmingSwitch === "on" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
                              }`}
                            >
                              {killSwitchBusy ? "Working…" : confirmingSwitch === "on" ? "Confirm: engage" : "Confirm: disengage"}
                            </button>
                            <button
                              onClick={() => setConfirmingSwitch(null)}
                              disabled={killSwitchBusy}
                              className="flex-1 rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-600 transition hover:bg-neutral-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="rounded-[28px] border border-neutral-200 bg-white/80 p-6 shadow-sm">
                      <h3 className="text-xl font-semibold text-neutral-900">Account hijack</h3>
                      <select
                        onFocus={fetchAllVoters}
                        onChange={(e) => handleImpersonate(e.target.value)}
                        value=""
                        className="mt-5 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none"
                      >
                        <option value="" disabled>-- Select Student --</option>
                        {allVoters.map((v) => (
                          <option key={v.email} value={v.email}>
                            {v.name} ({v.gender}) {v.has_voted ? "· Voted" : "· Not voted"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-sm">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2C5F8A]">CR Leaderboard</h3>
                    <div className="mt-4 space-y-3">
                      {(leaderboard?.leaderboard?.CR || []).map((c, i) => (
                        <div key={i} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
                          <span className="font-medium text-neutral-800">{c.name}</span>
                          <span className="rounded-full bg-[#DCEAFB] px-3 py-1 text-xs font-semibold text-[#2C5F8A]">{c.votes} votes</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-sm">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-[#8A2C5F]">GR Leaderboard</h3>
                    <div className="mt-4 space-y-3">
                      {(leaderboard?.leaderboard?.GR || []).map((c, i) => (
                        <div key={i} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
                          <span className="font-medium text-neutral-800">{c.name}</span>
                          <span className="rounded-full bg-[#FBE0EC] px-3 py-1 text-xs font-semibold text-[#8A2C5F]">{c.votes} votes</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {activeTab === "terminal" && (
          <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            
            {/* ANNOUNCEMENT BANNER */}
            {anySeatConfirmed && (
              <div className="lg:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Mandate Accepted</p>
                <div className="mt-2 space-y-1 text-sm text-emerald-900">
                  {crConfirmed && <p>🏆 <strong>{crResult?.nominee_name}</strong> has officially accepted the Class Representative seat.</p>}
                  {grConfirmed && <p>🏆 <strong>{grResult?.nominee_name}</strong> has officially accepted the Girls Representative seat.</p>}
                </div>
              </div>
            )}
            
            {votingIsClosed && (
              <div className="lg:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">Voting Paused</p>
                <p className="mt-1 text-sm text-rose-900">
                  The kill switch is engaged. Voting is currently closed for everyone.
                </p>
              </div>
            )}

            <div className="overflow-hidden rounded-[32px] border border-white/70 bg-white/65 shadow-[0_20px_60px_-25px_rgba(91,70,45,0.3)] backdrop-blur-xl">
              {votingIsClosed ? (
                <div className="grid min-h-[560px] place-items-center p-8 text-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.35em] text-neutral-400">Election Terminal</p>
                    <h3 className="mt-3 text-xl font-semibold text-neutral-900">Voting is closed</h3>
                    <p className="mt-2 text-sm text-neutral-500">
                      Check the Leaderboard tab for the current tally.
                    </p>
                  </div>
                </div>
              ) : showLetter ? (
                <div className="grid min-h-[560px] place-items-center p-6">
                  <div className="w-full max-w-md rounded-[30px] border border-neutral-100 bg-white p-8 text-center shadow-xl">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-neutral-400">Official Mandate</p>
                    <h3 className="mt-3 text-2xl font-semibold text-neutral-900">Final ballot preview</h3>
                    <div className="my-6 h-px w-full bg-neutral-100" />
                    <div className="space-y-5">
                      <div className="rounded-3xl bg-[#DCEAFB]/50 p-4">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-[#2C5F8A]">Class Representative</p>
                        <p className="mt-2 text-xl font-semibold text-neutral-900">{draft.CR}</p>
                      </div>
                      <div className="rounded-3xl bg-[#FBE0EC]/50 p-4">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-[#8A2C5F]">Girls Representative</p>
                        <p className="mt-2 text-xl font-semibold text-neutral-900">{draft.GR}</p>
                      </div>
                    </div>
                    <div className="mt-8 flex flex-col gap-3">
                      <button
                        onClick={submitFinalVote}
                        className="w-full rounded-full bg-emerald-600 px-5 py-3.5 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-emerald-700"
                      >
                        Lock Vote
                      </button>
                      <button
                        onClick={() => setShowLetter(false)}
                        className="w-full rounded-full border border-neutral-200 bg-white px-5 py-3.5 text-sm font-semibold uppercase tracking-[0.2em] text-neutral-700 transition hover:bg-neutral-50"
                      >
                        Discard & Edit
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b border-white/70 px-6 py-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.35em] text-neutral-400">Conversation</p>
                      <h3 className="text-lg font-semibold text-neutral-900">
                        {hasVoted ? "Campus gossip bot" : "Election host"}
                      </h3>
                    </div>
                  </div>
                  <div className="h-[520px] space-y-4 overflow-y-auto px-6 py-5">
                    {history
                      .filter((msg) => msg.role !== "system")
                      .map((msg, idx) => {
                        const clean = msg.content.replace(/\[KRODH:\s*\d+\]/g, "").trim();
                        if (!clean) return null;
                        const user = msg.role === "user";
                        return (
                          <div key={idx} className={`flex ${user ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[78%] whitespace-pre-wrap rounded-[26px] px-5 py-3.5 text-[14px] leading-relaxed shadow-sm ${
                                user
                                  ? "rounded-tr-md bg-gradient-to-br from-[#f6d9a8] to-[#f4a9a0] text-neutral-900"
                                  : "rounded-tl-md border border-neutral-200 bg-white text-neutral-700"
                              }`}
                            >
                              {clean}
                            </div>
                          </div>
                        );
                      })}
                    {loading && <div className="pl-2 text-[11px] uppercase tracking-[0.3em] text-neutral-400">Typing...</div>}
                  </div>
                  <div className="border-t border-white/70 bg-white/70 p-4">
                    <div className="flex items-center gap-3">
                      <input
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                        placeholder="Type your reply…"
                        className="flex-1 rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm outline-none transition focus:border-[#f4a9a0]"
                        disabled={loading}
                      />
                      <button
                        onClick={sendMessage}
                        disabled={loading}
                        className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-50"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <aside className="space-y-4">
              <div className="rounded-[28px] border border-white/70 bg-white/65 p-6 shadow-[0_20px_60px_-25px_rgba(91,70,45,0.3)] backdrop-blur-xl">
                <p className="text-[10px] uppercase tracking-[0.35em] text-neutral-400">Active Draft</p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-3xl bg-white p-4 shadow-sm">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[#2C5F8A]">CR</p>
                    <p className="mt-1 text-lg font-semibold text-neutral-900">{draft.CR}</p>
                  </div>
                  <div className="rounded-3xl bg-white p-4 shadow-sm">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[#8A2C5F]">GR</p>
                    <p className="mt-1 text-lg font-semibold text-neutral-900">{draft.GR}</p>
                  </div>
                </div>
                {!hasVoted && !votingIsClosed && (
                  <button
                    onClick={handlePreview}
                    className="mt-4 w-full rounded-full border border-neutral-200 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-700 transition hover:bg-neutral-50"
                  >
                    Preview ballot
                  </button>
                )}
              </div>
            </aside>
          </section>
        )}
      </div>
    </main>
  );
}