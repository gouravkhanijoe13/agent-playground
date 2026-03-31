"use client";

import { useState, useRef, useEffect } from "react";

interface Section { title: string; url: string; level: number; }
interface Outline { title: string; description: string; sections: Section[]; }
interface TldrData { tldr: string; bullets: string[]; }
interface ChatMsg { role: "user" | "assistant"; content: string; }

function formatInline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={i} className="bg-slate-100 text-pink-700 px-1.5 py-0.5 rounded text-sm font-mono">{part.slice(1,-1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={i} className="font-semibold text-gray-900">{part.slice(2,-2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i}>{part.slice(1,-1)}</em>;
    return <span key={i}>{part}</span>;
  });
}

function MarkdownDisplay({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-1 text-[15px]">
      {parts.map((part, idx) => {
        if (part.startsWith("```")) {
          const nl = part.indexOf("\n");
          const lang = nl > 3 ? part.slice(3, nl).trim() : "";
          const code = nl > 0 ? part.slice(nl+1,-3) : part.slice(3,-3);
          return (
            <div key={idx} className="my-4">
              {lang && <div className="bg-slate-700 text-slate-300 text-xs px-4 py-1.5 rounded-t-lg font-mono">{lang}</div>}
              <pre className={`bg-slate-900 text-slate-100 p-4 overflow-x-auto text-sm font-mono leading-relaxed ${lang?"rounded-b-lg":"rounded-lg"}`}><code>{code}</code></pre>
            </div>
          );
        }
        return (
          <div key={idx}>
            {part.split("\n").map((line, li) => {
              const t = line.trim();
              if (!t) return <div key={li} className="h-2"/>;
              if (t==="---") return <hr key={li} className="my-6 border-slate-200"/>;
              if (line.startsWith("# ")) return <h1 key={li} className="text-xl font-bold mt-6 mb-3 text-slate-900">{formatInline(line.slice(2))}</h1>;
              if (line.startsWith("## ")) return <h2 key={li} className="text-base font-semibold mt-6 mb-2 text-slate-800 border-b border-slate-200 pb-1.5">{formatInline(line.slice(3))}</h2>;
              if (line.startsWith("### ")) return <h3 key={li} className="text-sm font-semibold mt-4 mb-2 text-slate-700">{formatInline(line.slice(4))}</h3>;
              if (line.startsWith("- ")||line.startsWith("* ")) return <div key={li} className="flex items-start my-1.5 ml-3"><span className="mr-2.5 mt-2 h-1.5 w-1.5 rounded-full bg-indigo-400 flex-shrink-0"/><span className="text-slate-700 leading-relaxed">{formatInline(line.slice(2))}</span></div>;
              const nm = line.match(/^(\d+)\.\s(.*)/);
              if (nm) return <div key={li} className="flex items-start my-1.5 ml-3"><span className="mr-2 font-mono text-indigo-500 min-w-[1.5rem] text-sm">{nm[1]}.</span><span className="text-slate-700 leading-relaxed">{formatInline(nm[2])}</span></div>;
              if (line.startsWith("> ")) return <blockquote key={li} className="border-l-4 border-indigo-300 pl-4 py-1 my-2 text-slate-600 italic bg-indigo-50 rounded-r-lg">{formatInline(line.slice(2))}</blockquote>;
              return <p key={li} className="leading-relaxed text-slate-700 my-1">{formatInline(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

function Spinner({ className }: { className: string }) {
  return <div className={`border-2 border-t-transparent rounded-full animate-spin ${className}`}/>;
}

export default function DocAgentPage() {
  const [url, setUrl] = useState("");
  const [outline, setOutline] = useState<Outline | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tldr, setTldr] = useState<TldrData | null>(null);
  const [lesson, setLesson] = useState("");
  const [loadingOutline, setLoadingOutline] = useState(false);
  const [loadingTldr, setLoadingTldr] = useState(false);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [streamingLesson, setStreamingLesson] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [streamingChat, setStreamingChat] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const lessonAbortRef = useRef<AbortController | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  async function loadTldr(section: Section) {
    setLoadingTldr(true); setTldr(null);
    try {
      const res = await fetch("/api/doc-agent/tldr", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({sectionUrl:section.url, sectionTitle:section.title})
      });
      if (res.ok) setTldr(await res.json());
    } catch {}
    setLoadingTldr(false);
  }

  async function loadLesson(section: Section) {
    lessonAbortRef.current?.abort();
    const controller = new AbortController();
    lessonAbortRef.current = controller;
    setLesson(""); setLoadingLesson(true); setStreamingLesson(false);
    try {
      const res = await fetch("/api/doc-agent/lesson", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({sectionUrl:section.url, sectionTitle:section.title}),
        signal:controller.signal
      });
      if (!res.ok||!res.body) throw new Error("Failed");
      setLoadingLesson(false); setStreamingLesson(true);
      const reader = res.body.getReader(); const decoder = new TextDecoder();
      while (true) { const {done,value} = await reader.read(); if (done) break; setLesson(p=>p+decoder.decode(value,{stream:true})); }
      setStreamingLesson(false);
    } catch(e) { if ((e as Error).name!=="AbortError") { setLoadingLesson(false); setStreamingLesson(false); } }
  }

  function selectSection(index: number) {
    if (!outline) return;
    lessonAbortRef.current?.abort(); chatAbortRef.current?.abort();
    setCurrentIndex(index); setLesson(""); setTldr(null); setChatMessages([]);
    setSidebarOpen(false);
    mainRef.current?.scrollTo({top:0,behavior:"smooth"});
    loadTldr(outline.sections[index]); loadLesson(outline.sections[index]);
  }

  async function analyzeDoc() {
    if (!url.trim()) return;
    lessonAbortRef.current?.abort();
    setLoadingOutline(true); setError(""); setOutline(null); setLesson(""); setTldr(null); setChatMessages([]); setCurrentIndex(0);
    try {
      const res = await fetch("/api/doc-agent/outline", {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({url})
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error||"Failed"); }
      const data: Outline = await res.json();
      setOutline(data); setLoadingOutline(false);
      if (data.sections?.length>0) { loadTldr(data.sections[0]); loadLesson(data.sections[0]); }
    } catch(e) { setError(e instanceof Error ? e.message : "Unknown"); setLoadingOutline(false); }
  }

  async function sendChat() {
    if (!chatInput.trim()||streamingChat||!outline) return;
    const userMsg: ChatMsg = {role:"user",content:chatInput};
    const newMessages = [...chatMessages,userMsg];
    setChatMessages([...newMessages,{role:"assistant",content:""}]); setChatInput(""); setStreamingChat(true);
    const section = outline.sections[currentIndex];
    chatAbortRef.current?.abort(); const controller = new AbortController(); chatAbortRef.current = controller;
    try {
      const res = await fetch("/api/doc-agent/chat", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({sectionUrl:section.url, sectionTitle:section.title, messages:newMessages}),
        signal:controller.signal
      });
      if (!res.ok||!res.body) throw new Error("Chat failed");
      const reader = res.body.getReader(); const decoder = new TextDecoder();
      while (true) {
        const {done,value} = await reader.read(); if (done) break;
        const chunk = decoder.decode(value,{stream:true});
        setChatMessages(prev => { const u=[...prev]; u[u.length-1]={role:"assistant",content:u[u.length-1].content+chunk}; return u; });
      }
    } catch(e) {
      if ((e as Error).name!=="AbortError") setChatMessages(prev=>{ const u=[...prev]; u[u.length-1]={role:"assistant",content:"Sorry, something went wrong."}; return u; });
    }
    setStreamingChat(false);
  }

  const isLearning = outline!==null||loadingOutline;
  const currentSection = outline?.sections[currentIndex];

  return (
    <div className="flex flex-col bg-slate-50" style={{height:"100dvh"}}>

      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0 safe-top">
        <div className="flex items-center gap-3">
          {/* Hamburger (only when learning) */}
          {isLearning && (
            <button onClick={()=>setSidebarOpen(o=>!o)} className="p-2 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden flex-shrink-0" aria-label="Toggle menu">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                {sidebarOpen ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/> : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>}
              </svg>
            </button>
          )}
          <span className="text-lg flex-shrink-0">📚</span>
          <h1 className="text-sm font-bold text-slate-900 flex-shrink-0 hidden sm:block">DocLearn AI</h1>
          <div className="flex flex-1 gap-2 min-w-0">
            <input
              type="url" value={url} onChange={e=>setUrl(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&analyzeDoc()}
              placeholder="Paste a docs URL…"
              className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
            <button
              onClick={analyzeDoc} disabled={loadingOutline||!url.trim()}
              className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 flex-shrink-0"
            >
              {loadingOutline ? <Spinner className="h-4 w-4 border-white"/> : <span className="hidden sm:inline">Analyze</span>}
              {!loadingOutline && <svg className="sm:hidden w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>}
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-red-500 mt-2 px-1">⚠ {error}</p>}
      </header>

      {!isLearning ? (
        /* ── Landing ── */
        <div className="flex-1 overflow-y-auto px-5 py-10">
          <div className="max-w-lg mx-auto text-center">
            <div className="text-5xl mb-4">🎓</div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">Learn Any Technology From Its Official Docs</h2>
            <p className="text-sm text-slate-500 mb-7 leading-relaxed">
              Paste a link to any documentation — DocLearn AI turns it into an interactive course with TLDRs, code examples, and a chat assistant.
            </p>
            <div className="grid grid-cols-2 gap-2.5 text-sm text-slate-600 mb-7">
              {[["⚡","TLDR per section"],["🔨","Code examples"],["🧪","Practice challenges"],["💬","Per-section chat"]].map(([icon,text])=>(
                <div key={text} className="flex items-center gap-2 bg-white rounded-xl p-3 border border-slate-200 text-left">
                  <span className="text-lg flex-shrink-0">{icon}</span><span className="text-xs">{text}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">Try: </p>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {[
                ["LangGraph intro","https://langchain-ai.github.io/langgraph/tutorials/introduction/"],
                ["FastAPI tutorial","https://fastapi.tiangolo.com/tutorial/"],
                ["Kubernetes tutorials","https://kubernetes.io/docs/tutorials/"],
              ].map(([label,u])=>(
                <button key={u} onClick={()=>setUrl(u)} className="text-xs text-indigo-500 border border-indigo-200 bg-indigo-50 rounded-full px-3 py-1 hover:bg-indigo-100 transition">{label}</button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden relative">

          {/* ── Sidebar backdrop (mobile) ── */}
          {sidebarOpen && (
            <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={()=>setSidebarOpen(false)}/>
          )}

          {/* ── Sidebar ── */}
          <aside className={`
            fixed lg:relative inset-y-0 left-0 z-30 lg:z-auto
            w-72 lg:w-64 bg-white border-r border-slate-200
            flex flex-col flex-shrink-0 overflow-hidden
            transition-transform duration-200 ease-in-out
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
            safe-top
          `} style={{top: "var(--header-height,0)"}}>
            {loadingOutline ? (
              <div className="p-6 text-center mt-10">
                <Spinner className="h-5 w-5 border-indigo-500 mx-auto mb-3"/>
                <p className="text-xs text-slate-500">Reading doc structure…</p>
              </div>
            ) : outline ? (
              <>
                <div className="p-4 border-b border-slate-100 flex-shrink-0">
                  <h2 className="font-semibold text-slate-900 text-sm leading-snug">{outline.title}</h2>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">{outline.description}</p>
                  <p className="text-xs text-indigo-500 mt-1.5 font-medium">{outline.sections.length} sections</p>
                </div>
                <nav className="overflow-y-auto flex-1 p-2">
                  {outline.sections.map((section,i)=>(
                    <button key={i} onClick={()=>selectSection(i)}
                      className={`w-full text-left rounded-xl text-xs py-3 px-3 transition-all flex items-start gap-2.5 min-h-[44px] ${
                        i===currentIndex ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                      } ${section.level===2?"pl-6":""}`}>
                      <span className={`flex-shrink-0 font-mono text-[10px] mt-0.5 ${i===currentIndex?"text-indigo-400":"text-slate-300"}`}>
                        {String(i+1).padStart(2,"0")}
                      </span>
                      <span className="leading-relaxed">{section.title}</span>
                    </button>
                  ))}
                </nav>
              </>
            ) : null}
          </aside>

          {/* ── Main content ── */}
          <main ref={mainRef} className="flex-1 overflow-y-auto">
            {currentSection ? (
              <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-5 pb-10">

                {/* Section title chip */}
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={()=>setSidebarOpen(true)} className="lg:hidden text-xs text-indigo-500 bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-1 flex items-center gap-1.5 min-h-[36px]">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
                    Sections
                  </button>
                  <span className="text-xs text-slate-400">{currentIndex+1} of {outline?.sections.length}</span>
                </div>

                {/* TLDR card */}
                <div className="bg-gradient-to-br from-indigo-50 to-slate-50 border border-indigo-100 rounded-2xl p-4 mb-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">⚡</span>
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-800 text-sm">TLDR</span>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{currentSection.title}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={()=>currentIndex>0&&selectSection(currentIndex-1)} disabled={currentIndex===0}
                        className="min-h-[36px] px-3 text-xs font-medium text-slate-500 border border-slate-200 bg-white/70 rounded-xl hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition">← Prev</button>
                      <button
                        onClick={()=>outline&&currentIndex<outline.sections.length-1&&selectSection(currentIndex+1)}
                        disabled={!outline||currentIndex>=(outline?.sections.length??0)-1}
                        className="min-h-[36px] px-3 text-xs font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition">Skip →</button>
                    </div>
                  </div>
                  {loadingTldr ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                      <Spinner className="h-3 w-3 border-indigo-400"/> Generating summary…
                    </div>
                  ) : tldr ? (
                    <>
                      <p className="text-sm text-slate-700 leading-relaxed mb-3">{tldr.tldr}</p>
                      {tldr.bullets?.length>0 && (
                        <ul className="space-y-2">
                          {tldr.bullets.map((b,i)=>(
                            <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                              <span className="mt-1.5 h-1 w-1 rounded-full bg-indigo-400 flex-shrink-0"/>
                              {b}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : <p className="text-xs text-slate-400">Summary unavailable</p>}
                </div>

                {/* Progress bar */}
                <div className="flex items-center gap-2 mb-5">
                  <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-400 rounded-full transition-all duration-300"
                      style={{width:`${((currentIndex+1)/(outline?.sections.length??1))*100}%`}}/>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">{Math.round(((currentIndex+1)/(outline?.sections.length??1))*100)}%</span>
                </div>

                {/* Lesson */}
                {loadingLesson ? (
                  <div className="text-center py-14">
                    <Spinner className="h-7 w-7 border-indigo-500 mx-auto mb-3"/>
                    <p className="text-sm text-slate-400">Fetching documentation…</p>
                  </div>
                ) : lesson ? (
                  <>
                    {streamingLesson && (
                      <div className="flex items-center gap-2 mb-4 text-xs text-indigo-500">
                        <Spinner className="h-3 w-3 border-indigo-500"/> Generating lesson…
                      </div>
                    )}
                    <MarkdownDisplay content={lesson}/>
                  </>
                ) : null}

                {/* ── Chat ── */}
                <div className="mt-8 border-t border-slate-200 pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-base">💬</span>
                    <h3 className="font-semibold text-slate-800 text-sm">Ask about this section</h3>
                  </div>

                  {chatMessages.length>0 && (
                    <div className="space-y-3 mb-4">
                      {chatMessages.map((msg,i)=>(
                        <div key={i} className={`flex ${msg.role==="user"?"justify-end":"justify-start"}`}>
                          <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                            msg.role==="user" ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-700"
                          }`}>
                            {msg.role==="assistant" ? (
                              msg.content ? <MarkdownDisplay content={msg.content}/> :
                              <div className="flex items-center gap-2 text-slate-400 text-xs">
                                <Spinner className="h-3 w-3 border-slate-400"/> Thinking…
                              </div>
                            ) : msg.content}
                          </div>
                        </div>
                      ))}
                      <div ref={chatEndRef}/>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      ref={chatInputRef}
                      type="text" value={chatInput}
                      onChange={e=>setChatInput(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendChat()}
                      placeholder={`Ask about "${currentSection.title}"…`}
                      disabled={streamingChat}
                      className="flex-1 px-4 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:opacity-50 min-h-[48px]"
                    />
                    <button
                      onClick={sendChat} disabled={!chatInput.trim()||streamingChat}
                      className="px-4 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center min-w-[56px] min-h-[48px]"
                    >
                      {streamingChat ? <Spinner className="h-4 w-4 border-white"/> :
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>}
                    </button>
                  </div>
                </div>

                {/* Bottom nav */}
                {!streamingLesson&&lesson && (
                  <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-200">
                    <button onClick={()=>currentIndex>0&&selectSection(currentIndex-1)} disabled={currentIndex===0}
                      className="flex items-center gap-2 px-4 min-h-[44px] text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition">← Previous</button>
                    <button onClick={()=>outline&&currentIndex<outline.sections.length-1&&selectSection(currentIndex+1)} disabled={!outline||currentIndex>=(outline?.sections.length??0)-1}
                      className="flex items-center gap-2 px-4 min-h-[44px] text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition">Next →</button>
                  </div>
                )}
              </div>
            ) : null}
          </main>
        </div>
      )}
    </div>
  );
}
