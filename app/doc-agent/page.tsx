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
            <div key={idx} className="my-5">
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
              if (line.startsWith("# ")) return <h1 key={li} className="text-2xl font-bold mt-8 mb-3 text-slate-900">{formatInline(line.slice(2))}</h1>;
              if (line.startsWith("## ")) return <h2 key={li} className="text-lg font-semibold mt-7 mb-2 text-slate-800 border-b border-slate-200 pb-1.5">{formatInline(line.slice(3))}</h2>;
              if (line.startsWith("### ")) return <h3 key={li} className="text-base font-semibold mt-5 mb-2 text-slate-700">{formatInline(line.slice(4))}</h3>;
              if (line.startsWith("- ")||line.startsWith("* ")) return <div key={li} className="flex items-start my-1.5 ml-4"><span className="mr-2.5 mt-2 h-1.5 w-1.5 rounded-full bg-indigo-400 flex-shrink-0"/><span className="text-slate-700 leading-relaxed">{formatInline(line.slice(2))}</span></div>;
              const nm = line.match(/^(\d+)\.\s(.*)/);
              if (nm) return <div key={li} className="flex items-start my-1.5 ml-4"><span className="mr-2 font-mono text-indigo-500 min-w-[1.5rem] text-sm">{nm[1]}.</span><span className="text-slate-700 leading-relaxed">{formatInline(nm[2])}</span></div>;
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

  const lessonAbortRef = useRef<AbortController | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  async function loadTldr(section: Section) {
    setLoadingTldr(true); setTldr(null);
    try {
      const res = await fetch("/api/doc-agent/tldr", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({sectionUrl:section.url,sectionTitle:section.title}) });
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
      const res = await fetch("/api/doc-agent/lesson", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({sectionUrl:section.url,sectionTitle:section.title}), signal:controller.signal });
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
    mainRef.current?.scrollTo({top:0,behavior:"smooth"});
    loadTldr(outline.sections[index]); loadLesson(outline.sections[index]);
  }

  async function analyzeDoc() {
    if (!url.trim()) return;
    lessonAbortRef.current?.abort();
    setLoadingOutline(true); setError(""); setOutline(null); setLesson(""); setTldr(null); setChatMessages([]); setCurrentIndex(0);
    try {
      const res = await fetch("/api/doc-agent/outline", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({url}) });
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
      const res = await fetch("/api/doc-agent/chat", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({sectionUrl:section.url,sectionTitle:section.title,messages:newMessages}), signal:controller.signal });
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
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <span className="text-xl">📚</span>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">DocLearn AI</h1>
              <p className="text-xs text-slate-400">Turn any docs into a course</p>
            </div>
          </div>
          <div className="flex flex-1 gap-2">
            <input type="url" value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&analyzeDoc()} placeholder="Paste any documentation URL…" className="flex-1 px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"/>
            <button onClick={analyzeDoc} disabled={loadingOutline||!url.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 flex-shrink-0">
              {loadingOutline ? <><Spinner className="h-3.5 w-3.5 border-white"/> Analyzing…</> : "Analyze Docs"}
            </button>
          </div>
          {error && <p className="text-xs text-red-500 flex-shrink-0">⚠ {error}</p>}
        </div>
      </header>

      {!isLearning ? (
        /* Landing */
        <div className="max-w-2xl mx-auto mt-16 text-center px-6">
          <div className="text-6xl mb-5">🎓</div>
          <h2 className="text-2xl font-semibold text-slate-800 mb-3">Learn Any Technology From Its Official Docs</h2>
          <p className="text-slate-500 mb-8 leading-relaxed">Paste a link to any technical documentation. DocLearn AI transforms each section into an interactive lesson with TLDRs, code examples, and a chat assistant.</p>
          <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
            {[["⚡","TLDR summary for each section"],["🔨","Complete, runnable code examples"],["🧪","Hands-on practice challenges"],["💬","Chat to ask questions per section"]].map(([icon,text])=>(
              <div key={text} className="flex items-center gap-2.5 bg-white rounded-xl p-3.5 border border-slate-200 text-left"><span className="text-xl flex-shrink-0">{icon}</span><span>{text}</span></div>
            ))}
          </div>
          <p className="mt-8 text-xs text-slate-400">
            Try: <button className="text-indigo-500 hover:underline" onClick={()=>setUrl("https://langchain-ai.github.io/langgraph/tutorials/introduction/")}>LangGraph intro</button>
            {" · "}<button className="text-indigo-500 hover:underline" onClick={()=>setUrl("https://kubernetes.io/docs/tutorials/")}>Kubernetes tutorials</button>
            {" · "}<button className="text-indigo-500 hover:underline" onClick={()=>setUrl("https://fastapi.tiangolo.com/tutorial/")}>FastAPI tutorial</button>
          </p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 overflow-hidden">
            {loadingOutline ? (
              <div className="p-6 text-center mt-8"><Spinner className="h-5 w-5 border-indigo-500 mx-auto mb-3"/><p className="text-xs text-slate-500">Reading doc structure…</p></div>
            ) : outline ? (
              <>
                <div className="p-4 border-b border-slate-100 flex-shrink-0">
                  <h2 className="font-semibold text-slate-900 text-sm leading-snug">{outline.title}</h2>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">{outline.description}</p>
                  <p className="text-xs text-indigo-500 mt-1.5 font-medium">{outline.sections.length} sections</p>
                </div>
                <nav className="overflow-y-auto flex-1 p-2">
                  {outline.sections.map((section,i) => (
                    <button key={i} onClick={()=>selectSection(i)}
                      className={`w-full text-left rounded-lg text-xs py-2 transition-all flex items-start gap-2 ${section.level===2?"pl-6 pr-2":"px-2.5"} ${i===currentIndex?"bg-indigo-50 text-indigo-700 font-medium":"text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}>
                      <span className={`flex-shrink-0 mt-0.5 font-mono text-[10px] ${i===currentIndex?"text-indigo-400":"text-slate-300"}`}>{String(i+1).padStart(2,"0")}</span>
                      <span className="leading-relaxed">{section.title}</span>
                    </button>
                  ))}
                </nav>
              </>
            ) : null}
          </aside>

          {/* Main */}
          <main ref={mainRef} className="flex-1 overflow-y-auto">
            {currentSection ? (
              <div className="max-w-3xl mx-auto px-8 py-6">
                {/* TLDR card */}
                <div className="bg-gradient-to-br from-indigo-50 to-slate-50 border border-indigo-100 rounded-2xl p-5 mb-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">⚡</span>
                      <span className="font-semibold text-slate-800 text-sm">TLDR</span>
                      <span className="text-xs text-slate-400 truncate">· {currentSection.title}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <button onClick={()=>currentIndex>0&&selectSection(currentIndex-1)} disabled={currentIndex===0}
                        className="px-2.5 py-1 text-xs font-medium text-slate-500 border border-slate-200 bg-white/70 rounded-lg hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition">← Prev</button>
                      <button onClick={()=>outline&&currentIndex<outline.sections.length-1&&selectSection(currentIndex+1)} disabled={!outline||currentIndex>=(outline?.sections.length??0)-1}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition">Skip →</button>
                    </div>
                  </div>
                  {loadingTldr ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400"><Spinner className="h-3 w-3 border-indigo-400"/> Generating summary…</div>
                  ) : tldr ? (
                    <>
                      <p className="text-sm text-slate-700 leading-relaxed mb-3">{tldr.tldr}</p>
                      {tldr.bullets?.length>0 && (
                        <ul className="space-y-1.5">
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

                {/* Progress */}
                <div className="flex items-center gap-2 mb-6 text-xs text-slate-400">
                  <span className="flex-shrink-0">{currentIndex+1} / {outline?.sections.length}</span>
                  <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-400 rounded-full transition-all duration-300" style={{width:`${((currentIndex+1)/(outline?.sections.length??1))*100}%`}}/>
                  </div>
                </div>

                {/* Lesson */}
                {loadingLesson ? (
                  <div className="text-center py-16"><Spinner className="h-7 w-7 border-indigo-500 mx-auto mb-3"/><p className="text-sm text-slate-400">Fetching documentation…</p></div>
                ) : lesson ? (
                  <>
                    {streamingLesson && <div className="flex items-center gap-2 mb-4 text-xs text-indigo-500"><Spinner className="h-3 w-3 border-indigo-500"/> Generating lesson…</div>}
                    <MarkdownDisplay content={lesson}/>
                  </>
                ) : null}

                {/* Chat */}
                <div className="mt-10 border-t border-slate-200 pt-8">
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-base">💬</span>
                    <h3 className="font-semibold text-slate-800 text-sm">Ask about this section</h3>
                    <span className="text-xs text-slate-400 truncate">· {currentSection.title}</span>
                  </div>
                  {chatMessages.length>0 && (
                    <div className="space-y-4 mb-4">
                      {chatMessages.map((msg,i)=>(
                        <div key={i} className={`flex ${msg.role==="user"?"justify-end":"justify-start"}`}>
                          <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${msg.role==="user"?"bg-indigo-600 text-white":"bg-white border border-slate-200 text-slate-700"}`}>
                            {msg.role==="assistant" ? (
                              msg.content ? <MarkdownDisplay content={msg.content}/> : <div className="flex items-center gap-2 text-slate-400 text-xs py-0.5"><Spinner className="h-3 w-3 border-slate-400"/> Thinking…</div>
                            ) : msg.content}
                          </div>
                        </div>
                      ))}
                      <div ref={chatEndRef}/>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input type="text" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendChat()} placeholder={`Ask anything about "${currentSection.title}"…`} disabled={streamingChat}
                      className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:opacity-50"/>
                    <button onClick={sendChat} disabled={!chatInput.trim()||streamingChat}
                      className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center min-w-[60px]">
                      {streamingChat ? <Spinner className="h-4 w-4 border-white"/> : "Send"}
                    </button>
                  </div>
                </div>

                {/* Bottom nav */}
                {!streamingLesson&&lesson && (
                  <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200 mb-8">
                    <button onClick={()=>currentIndex>0&&selectSection(currentIndex-1)} disabled={currentIndex===0}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition">← Previous</button>
                    <span className="text-sm text-slate-400">{currentIndex+1} / {outline?.sections.length}</span>
                    <button onClick={()=>outline&&currentIndex<outline.sections.length-1&&selectSection(currentIndex+1)} disabled={!outline||currentIndex>=(outline?.sections.length??0)-1}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition">Next →</button>
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
