"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/app/components/Navbar";

/* ============================================================
   TYPES
============================================================ */
interface Conversation {
  id: number;
  wa_id: string;
  phone: string | null;
  profile_name: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_type: string | null;
  unread_count: number;
  message_count: number;
}

interface Message {
  id: number;
  conversation_id: number;
  direction: "in" | "out";
  wa_message_id: string | null;
  type: string; // text | audio | image | document | ...
  body: string | null;
  media_id: string | null;
  media_url: string | null;
  mime_type: string | null;
  caption: string | null;
  filename: string | null;
  voice_duration_sec: number | null;
  status: string | null;
  error_message: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

/* ============================================================
   CONSTANTS
============================================================ */
const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20";

const POLL_CONVERSATIONS_MS = 5000;
const POLL_MESSAGES_MS = 3000;

/* ============================================================
   PAGE
============================================================ */
export default function WhatsAppPage() {
  return (
    <>
      <Navbar />
      <WhatsAppMain />
    </>
  );
}

function WhatsAppMain() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        setCollapsed(localStorage.getItem("erp_sidebar_collapsed") === "true");
      } catch {
        /* ignore */
      }
    };
    read();
    const onCustom = () => read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "erp_sidebar_collapsed") read();
    };
    window.addEventListener("erp:sidebar-collapse", onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("erp:sidebar-collapse", onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <main
      className={`min-h-screen bg-gray-50 pt-16 transition-[padding] duration-200 ease-out ${
        collapsed ? "lg:pl-[72px]" : "lg:pl-64"
      }`}
    >
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <WhatsAppContent />
      </div>
    </main>
  );
}

/* ============================================================
   CONTENT
============================================================ */
function WhatsAppContent() {
  /* ---- Conversations state ---- */
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convPagination, setConvPagination] = useState<Pagination>({
    page: 1,
    limit: 30,
    total: 0,
    total_pages: 0,
  });
  const [convLoading, setConvLoading] = useState(true);
  const [convError, setConvError] = useState<string | null>(null);
  const [convSearch, setConvSearch] = useState("");
  const [convPage, setConvPage] = useState(1);

  /* ---- Selected conversation + messages ---- */
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  /* ---- Composer ---- */
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  /* ---- Layout / scroll refs ---- */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );

  /* ============================================================
     FETCH CONVERSATIONS
  ============================================================ */
  const fetchConversations = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setConvLoading(true);
      setConvError(null);
      try {
        const params = new URLSearchParams();
        if (convSearch) params.set("search", convSearch);
        params.set("page", String(convPage));
        params.set("limit", String(convPagination.limit));

        const res = await fetch(`/api/whatsapp/conversations?${params}`, {
          credentials: "include",
        });
        if (res.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        if (!res.ok) throw new Error("Unable to load conversations.");
        const json = await res.json();
        setConversations(json.data || []);
        setConvPagination(
          json.pagination || { page: 1, limit: 30, total: 0, total_pages: 0 }
        );
      } catch (err) {
        setConvError(
          err instanceof Error ? err.message : "Something went wrong"
        );
      } finally {
        if (!opts?.silent) setConvLoading(false);
      }
    },
    [convSearch, convPage, convPagination.limit]
  );

  // Initial + filter-driven load (debounced)
  useEffect(() => {
    const t = setTimeout(() => fetchConversations(), 250);
    return () => clearTimeout(t);
  }, [fetchConversations]);

  // Reset page when search changes
  useEffect(() => {
    setConvPage(1);
  }, [convSearch]);

  // Poll conversations (real-time inbox)
  useEffect(() => {
    const id = setInterval(() => {
      fetchConversations({ silent: true });
    }, POLL_CONVERSATIONS_MS);
    return () => clearInterval(id);
  }, [fetchConversations]);

  /* ============================================================
     LOAD MESSAGES FOR ACTIVE CONVERSATION
  ============================================================ */
  const loadMessages = useCallback(
    async (conversationId: number, opts?: { beforeId?: number }) => {
      const isOlder = !!opts?.beforeId;
      if (isOlder) setLoadingOlder(true);
      else setMsgLoading(true);
      setMsgError(null);

      try {
        const params = new URLSearchParams();
        params.set("limit", "50");
        if (opts?.beforeId) params.set("before_id", String(opts.beforeId));

        const res = await fetch(
          `/api/whatsapp/conversations/${conversationId}/messages?${params}`,
          { credentials: "include" }
        );
        if (!res.ok) throw new Error("Unable to load messages.");
        const json = await res.json();
        const rows: Message[] = json.data || [];

        if (isOlder) {
          setMessages((prev) => [...rows, ...prev]);
          setHasMoreOlder(rows.length >= 50);
        } else {
          setMessages(rows);
          setHasMoreOlder(rows.length >= 50);
          shouldStickToBottomRef.current = true;
          // also clear unread locally
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId ? { ...c, unread_count: 0 } : c
            )
          );
        }
      } catch (err) {
        setMsgError(
          err instanceof Error ? err.message : "Something went wrong"
        );
      } finally {
        if (isOlder) setLoadingOlder(false);
        else setMsgLoading(false);
      }
    },
    []
  );

  // When active conversation changes → load latest
  useEffect(() => {
    if (activeId == null) {
      setMessages([]);
      return;
    }
    loadMessages(activeId);
  }, [activeId, loadMessages]);

  // Poll for NEW messages (real-time chat)
  useEffect(() => {
    if (activeId == null) return;
    const id = setInterval(async () => {
      try {
        const lastId = messages.length
          ? messages[messages.length - 1].id
          : undefined;
        const params = new URLSearchParams();
        params.set("limit", "100");
        if (lastId) params.set("after_id", String(lastId));

        const res = await fetch(
          `/api/whatsapp/conversations/${activeId}/messages?${params}`,
          { credentials: "include" }
        );
        if (!res.ok) return;
        const json = await res.json();
        const rows: Message[] = json.data || [];
        if (rows.length > 0) {
          shouldStickToBottomRef.current = true;
          setMessages((prev) => {
            // Deduplicate by id in case of overlap
            const seen = new Set(prev.map((m) => m.id));
            const add = rows.filter((r) => !seen.has(r.id));
            return add.length ? [...prev, ...add] : prev;
          });
          // Also bump conversation preview instantly
          setConversations((prev) =>
            prev.map((c) =>
              c.id === activeId
                ? {
                    ...c,
                    last_message_at:
                      rows[rows.length - 1].sent_at ||
                      rows[rows.length - 1].created_at,
                    last_message_preview:
                      rows[rows.length - 1].body ||
                      `[${rows[rows.length - 1].type}]`,
                    last_message_type: rows[rows.length - 1].type,
                  }
                : c
            )
          );
        }
      } catch {
        /* silent */
      }
    }, POLL_MESSAGES_MS);
    return () => clearInterval(id);
  }, [activeId, messages]);

  /* ============================================================
     SCROLL BEHAVIOUR
  ============================================================ */
  // Stick to bottom when new messages arrive
  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages]);

  // Load older on scroll-to-top
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Detect if user scrolled to top
    if (el.scrollTop < 40 && hasMoreOlder && !loadingOlder && activeId) {
      const oldest = messages[0];
      if (oldest) {
        // Preserve scroll position after prepending
        const prevHeight = el.scrollHeight;
        shouldStickToBottomRef.current = false;
        loadMessages(activeId, { beforeId: oldest.id }).then(() => {
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              const newHeight = scrollRef.current.scrollHeight;
              scrollRef.current.scrollTop = newHeight - prevHeight;
            }
          });
        });
      }
    }
    // Update stickiness based on distance from bottom
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 80;
  };

  /* ============================================================
     SEND MESSAGE
  ============================================================ */
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || !draft.trim() || sending) return;

    const text = draft.trim();
    setSending(true);
    setSendError(null);
    setDraft("");

    // Optimistic message
    const optimisticId = -Date.now();
    const optimistic: Message = {
      id: optimisticId,
      conversation_id: activeId,
      direction: "out",
      wa_message_id: null,
      type: "text",
      body: text,
      media_id: null,
      media_url: null,
      mime_type: null,
      caption: null,
      filename: null,
      voice_duration_sec: null,
      status: "sending",
      error_message: null,
      sent_at: new Date().toISOString(),
      received_at: null,
      created_at: new Date().toISOString(),
    };
    shouldStickToBottomRef.current = true;
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch("/api/whatsapp/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ conversation_id: activeId, body: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.data) {
        throw new Error(json?.error || "Failed to send message.");
      }
      // Replace optimistic with server row
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? json.data : m))
      );
      // Update conversation preview
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                last_message_at: json.data.sent_at || json.data.created_at,
                last_message_preview: text,
                last_message_type: "text",
              }
            : c
        )
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to send message.";
      setSendError(msg);
      // Mark optimistic as failed
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId
            ? { ...m, status: "failed", error_message: msg }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  };

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">WhatsApp</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Live inbox synced from Meta Cloud API.
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {convPagination.total.toLocaleString()} conversations
        </div>
      </div>

      {/* WORKSPACE */}
      <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-gray-200 bg-white md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr]">
        {/* CONVERSATION LIST */}
        <aside className="flex max-h-[calc(100vh-220px)] flex-col border-b border-gray-200 md:border-b-0 md:border-r">
          <div className="border-b border-gray-200 p-3">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search name or number…"
                value={convSearch}
                onChange={(e) => setConvSearch(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {convLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-md bg-gray-100"
                  />
                ))}
              </div>
            ) : convError ? (
              <div className="p-4 text-center">
                <p className="text-sm text-gray-600">{convError}</p>
                <button
                  onClick={() => fetchConversations()}
                  className="mt-2 text-sm font-medium text-[#0fa846] underline hover:no-underline"
                >
                  Try again
                </button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">
                No conversations yet.
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`flex w-full items-start gap-3 border-b border-gray-100 px-3 py-3 text-left transition hover:bg-gray-50 ${
                    activeId === c.id ? "bg-[#17D65D]/5" : ""
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#17D65D]/15 text-sm font-semibold text-[#0fa846]">
                    {(c.profile_name || c.phone || c.wa_id || "?")
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-gray-900">
                        {c.profile_name || c.phone || c.wa_id}
                      </span>
                      <span className="shrink-0 text-[10px] text-gray-400">
                        {c.last_message_at
                          ? formatRelative(c.last_message_at)
                          : ""}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-gray-500">
                        {previewFor(c)}
                      </span>
                      {c.unread_count > 0 && (
                        <span className="shrink-0 rounded-full bg-[#17D65D] px-1.5 py-0.5 text-[10px] font-bold text-black">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {convPagination.total_pages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-3 py-2">
              <button
                disabled={convPagination.page === 1}
                onClick={() => setConvPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-[11px] text-gray-500">
                {convPagination.page} / {convPagination.total_pages}
              </span>
              <button
                disabled={convPagination.page === convPagination.total_pages}
                onClick={() =>
                  setConvPage((p) =>
                    Math.min(convPagination.total_pages, p + 1)
                  )
                }
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </aside>

        {/* CHAT PANEL */}
        <section className="flex h-[calc(100vh-220px)] flex-col">
          {!activeConversation ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#17D65D]/10">
                <svg
                  className="h-7 w-7 text-[#0fa846]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72A8.947 8.947 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h3 className="mt-3 text-sm font-medium text-gray-900">
                Select a conversation
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Choose a chat from the left to view messages.
              </p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#17D65D]/15 text-sm font-semibold text-[#0fa846]">
                    {(activeConversation.profile_name ||
                      activeConversation.phone ||
                      activeConversation.wa_id ||
                      "?")
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {activeConversation.profile_name ||
                        activeConversation.phone ||
                        activeConversation.wa_id}
                    </div>
                    <div className="text-xs text-gray-500">
                      {activeConversation.phone ||
                        activeConversation.wa_id}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {activeConversation.message_count} messages
                </div>
              </div>

              {/* Messages */}
              <div
                ref={scrollRef}
                onScroll={onScroll}
                className="flex-1 overflow-y-auto bg-gray-50 px-4 py-4"
              >
                {loadingOlder && (
                  <div className="mb-3 text-center text-xs text-gray-400">
                    Loading older messages…
                  </div>
                )}
                {!hasMoreOlder && messages.length > 0 && (
                  <div className="mb-3 text-center text-[11px] text-gray-400">
                    Beginning of conversation
                  </div>
                )}

                {msgLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-10 w-2/3 animate-pulse rounded-lg bg-gray-200 ${
                          i % 2 === 0 ? "ml-auto" : ""
                        }`}
                      />
                    ))}
                  </div>
                ) : msgError ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-600">{msgError}</p>
                    <button
                      onClick={() => activeId && loadMessages(activeId)}
                      className="mt-2 text-sm font-medium text-[#0fa846] underline hover:no-underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">
                    No messages yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {messages.map((m) => (
                      <MessageBubble key={m.id} message={m} />
                    ))}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <form
                onSubmit={handleSend}
                className="border-t border-gray-200 bg-white p-3"
              >
                {sendError && (
                  <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
                    {sendError}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    rows={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e as unknown as React.FormEvent);
                      }
                    }}
                    placeholder="Type a message…"
                    className="max-h-40 min-h-[42px] flex-1 resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#17D65D] focus:ring-2 focus:ring-[#17D65D]/20"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="inline-flex h-[42px] items-center justify-center rounded-md bg-[#17D65D] px-4 text-sm font-medium text-black shadow-sm transition hover:bg-[#15c455] disabled:opacity-40"
                  >
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-gray-400">
                  Enter to send · Shift+Enter for a new line
                </p>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/* ============================================================
   MESSAGE BUBBLE (text + voice + media)
============================================================ */
function MessageBubble({ message }: { message: Message }) {
  const isOut = message.direction === "out";
  const isPending = message.status === "sending";
  const isFailed = message.status === "failed";

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
          isOut
            ? isFailed
              ? "border border-red-200 bg-red-50 text-red-800"
              : "border border-[#17D65D]/20 bg-[#17D65D]/10 text-gray-900"
            : "border border-gray-200 bg-white text-gray-900"
        }`}
      >
        {/* Content by type */}
        {message.type === "audio" ? (
          <VoiceBubble message={message} />
        ) : message.type === "text" ? (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        ) : message.type === "image" && message.media_id ? (
          <div className="space-y-1">
            <img
              src={`/api/whatsapp/messages/${message.id}/media`}
              alt={message.caption || "image"}
              className="max-h-64 rounded-md object-cover"
            />
            {message.caption && (
              <p className="whitespace-pre-wrap break-words text-sm">
                {message.caption}
              </p>
            )}
          </div>
        ) : message.type === "document" && message.media_id ? (
          <a
            href={`/api/whatsapp/messages/${message.id}/media`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 underline"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            {message.filename || "Download file"}
          </a>
        ) : (
          <p className="italic text-gray-500">[{message.type}]</p>
        )}

        {/* Footer */}
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
            isOut ? "text-gray-500" : "text-gray-400"
          }`}
        >
          <span>
            {formatTime(
              message.sent_at || message.received_at || message.created_at
            )}
          </span>
          {isOut && (
            <>
              {isPending && <span>· sending…</span>}
              {isFailed && <span className="text-red-600">· failed</span>}
              {!isPending && !isFailed && (
                <svg
                  className="h-3 w-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M16.7 5.3a1 1 0 00-1.4 0L9 11.6 6.7 9.3a1 1 0 00-1.4 1.4l3 3a1 1 0 001.4 0l7-7a1 1 0 000-1.4z" />
                </svg>
              )}
            </>
          )}
        </div>

        {isFailed && message.error_message && (
          <div className="mt-1 text-[11px] text-red-600">
            {message.error_message}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   VOICE NOTE PLAYER
============================================================ */
function VoiceBubble({ message }: { message: Message }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(
    message.voice_duration_sec || 0
  );
  const [current, setCurrent] = useState(0);
  const src = message.media_id
    ? `/api/whatsapp/messages/${message.id}/media`
    : null;

  const toggle = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      try {
        await el.play();
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <div className="flex min-w-[220px] items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#17D65D] text-black shadow-sm transition hover:bg-[#15c455] disabled:opacity-40"
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <rect x="5" y="4" width="3" height="12" rx="1" />
            <rect x="12" y="4" width="3" height="12" rx="1" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6 4l10 6-10 6V4z" />
          </svg>
        )}
      </button>

      <div className="flex-1">
        {/* waveform-ish progress bar */}
        <div className="relative h-6 w-full overflow-hidden rounded bg-[#17D65D]/15">
          <div
            className="absolute inset-y-0 left-0 bg-[#17D65D]/60 transition-[width]"
            style={{
              width: `${
                duration > 0 ? Math.min(100, (current / duration) * 100) : 0
              }%`,
            }}
          />
          <div className="absolute inset-0 flex items-center gap-[2px] px-2">
            {Array.from({ length: 28 }).map((_, i) => {
              const h = 4 + ((i * 7 + 3) % 12);
              return (
                <span
                  key={i}
                  className="w-[2px] rounded-full bg-[#0fa846]/70"
                  style={{ height: `${h}px` }}
                />
              );
            })}
          </div>
        </div>
        <div className="mt-0.5 flex justify-between text-[10px] text-gray-500">
          <span>{formatSec(current)}</span>
          <span>{formatSec(duration)}</span>
        </div>
      </div>

      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setCurrent(0);
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            setCurrent(el.currentTime || 0);
            if (
              (!duration || Number.isNaN(duration)) &&
              el.duration &&
              !Number.isNaN(el.duration)
            ) {
              setDuration(el.duration);
            }
          }}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (d && !Number.isNaN(d)) setDuration(d);
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   HELPERS
============================================================ */
function formatTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return d.toLocaleDateString("en-PK", { day: "2-digit", month: "short" });
}

function formatSec(sec: number) {
  if (!sec || Number.isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function previewFor(c: Conversation) {
  if (c.last_message_type === "audio") return "🎤 Voice message";
  if (c.last_message_type === "image") return "📷 Photo";
  if (c.last_message_type === "document") return "📄 Document";
  return c.last_message_preview || "—";
}
