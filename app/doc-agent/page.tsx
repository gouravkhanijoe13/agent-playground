"use client";

import { useState, useRef } from "react";

interface Section {
  title: string;
  url: string;
  level: number;
}

interface Outline {
  title: string;
  description: string;
  sections: Section[];
}

// ─── Inline markdown formatter ───────────────────────────────────────────────

function formatInline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={i}
          className="bg-slate-100 text-pink-700 px-1.5 py-0.5 rounded text-sm font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-gray-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <span key={i}>{part}</span>;
  });
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function MarkdownDisplay({ content }: { content: string }) {
  // Split into code blocks vs text segments
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-1 text-[15px]">
      {parts.map((part, idx) => {
        if (part.startsWith("```")) {
          const firstNewline = part.indexOf("\n");
          const lang =
            firstNewline > 3 ? part.slice(3, firstNewline).trim() : "";
          const code =
            firstNewline > 0
              ? part.slice(firstNewline + 1, -3)
              : part.slice(3, -3);
          return (
            <div key={idx} className="my-5">
              {lang && (
                <div className="bg-slate-700 text-slate-300 text-xs px-4 py-1.5 rounded-t-lg font-mono tracking-wide">
                  {lang}
                </div>
              )}
              <pre
                className={`bg-slate-900 text-slate-100 p-4 overflow-x-auto text-sm font-mono leading-relaxed ${
                  lang ? "rounded-b-lg" : "rounded-lg"
                }`}
              >
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        // Render text lines
        const lines = part.split("\n");
        return (
          <div key={idx}>
            {lines.map((line, li) => {
              const trimmed = line.trim();

              if (!trimmed) return <div key={li} className="h-2" />;

              if (trimmed === "---")
                return <hr key={li} className="my-6 border-slate-200" />;

              if (line.startsWith("# "))
                return (
                  <h1
                    key={li}
                    className="text-2xl font-bold mt-8 mb-3 text-slate-900"
                  >
                    {formatInline(line.slice(2))}
                  </h1>
                );

              if (line.startsWith("## "))
                return (
                  <h2
                    key={li}
                    className="text-lg font-semibold mt-7 mb-2 text-slate-800 border-b border-slate-200 pb-1.5"
                  >
                    {formatInline(line.slice(3))}
                  </h2>
                );

              if (line.startsWith("### "))
                return (
                  <h3
                    key={li}
                    className="text-base font-semibold mt-5 mb-2 text-slate-700"
                  >
                    {formatInline(line.slice(4))}
                  </h3>
                );

              if (line.startsWith("- ") || line.startsWith("* "))
                return (
                  <div key={li} className="flex items-start my-1.5 ml-4">
                    <span className="mr-2.5 mt-2 h-1.5 w-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                    <span className="text-slate-700 leading-relaxed">
                      {formatInline(line.slice(2))}
                    </span>
                  </div>
                );

              const numMatch = line.match(/^(\d+)\.\s(.*)/);
              if (numMatch)
                return (
                  <div key={li} className="flex items-start my-1.5 ml-4">
                    <span className="mr-2 font-mono text-indigo-500 min-w-[1.5rem] text-sm">
                      {numMatch[1]}.
                    </span>
                    <span className="text-slate-700 leading-relaxed">
                      {formatInline(numMatch[2])}
                    </span>
                  </div>
                );

              if (line.startsWith("> "))
                return (
                  <blockquote
                    key={li}
                    className="border-l-4 border-indigo-300 pl-4 py-1 my-2 text-slate-600 italic bg-indigo-50 rounded-r-lg"
                  >
                    {formatInline(line.slice(2))}
                  </blockquote>
                );

              return (
                <p key={li} className="leading-relaxed text-slate-700 my-1">
                  {formatInline(line)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DocAgentPage() {
  const [url, setUrl] = useState("");
  const [outline, setOutline] = useState<Outline | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [lesson, setLesson] = useState("");
  const [loadingOutline, setLoadingOutline] = useState(false);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  async function loadLesson(section: Section, index: number) {
    // Cancel any in-progress stream
    abortRef.current?.abort();

    setCurrentIndex(index);
    setLesson("");
    setLoadingLesson(true);
    setError("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/doc-agent/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionUrl: section.url,
          sectionTitle: section.title,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error("Failed to fetch lesson");

      setLoadingLesson(false);
      setStreaming(true);
      mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setLesson((prev) => prev + chunk);
      }

      setStreaming(false);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Failed to load lesson");
        setLoadingLesson(false);
        setStreaming(false);
      }
    }
  }

  async function analyzeDoc() {
    if (!url.trim()) return;
    abortRef.current?.abort();
    setLoadingOutline(true);
    setError("");
    setOutline(null);
    setLesson("");
    setCurrentIndex(-1);

    try {
      const res = await fetch("/api/doc-agent/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to analyze documentation");
      }

      const data: Outline = await res.json();
      setOutline(data);
      setLoadingOutline(false);

      // Auto-load the first section
      if (data.sections?.length > 0) {
        await loadLesson(data.sections[0], 0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setLoadingOutline(false);
    }
  }

  function handleNext() {
    if (!outline || currentIndex >= outline.sections.length - 1) return;
    loadLesson(outline.sections[currentIndex + 1], currentIndex + 1);
  }

  function handlePrev() {
    if (!outline || currentIndex <= 0) return;
    loadLesson(outline.sections[currentIndex - 1], currentIndex - 1);
  }

  const isLearning = outline !== null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">📚</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">
                DocLearn AI
              </h1>
              <p className="text-xs text-slate-500">
                Turn any technical docs into a hands-on course
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyzeDoc()}
              placeholder="https://langchain-ai.github.io/langgraph/tutorials/ or any doc URL…"
              className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            />
            <button
              onClick={analyzeDoc}
              disabled={loadingOutline || !url.trim()}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 flex-shrink-0"
            >
              {loadingOutline ? (
                <>
                  <Spinner className="h-4 w-4 border-white" />
                  Analyzing…
                </>
              ) : (
                "Analyze Docs"
              )}
            </button>
          </div>

          {error && (
            <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
              <span>⚠️</span> {error}
            </p>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      {!isLearning && !loadingOutline ? (
        // Landing state
        <div className="max-w-2xl mx-auto mt-16 text-center px-6">
          <div className="text-6xl mb-5">🎓</div>
          <h2 className="text-2xl font-semibold text-slate-800 mb-3">
            Learn Any Technology From Its Official Docs
          </h2>
          <p className="text-slate-500 mb-8 leading-relaxed">
            Paste a link to any technical documentation — LangGraph, Kubernetes,
            MySQL, FastAPI, Terraform, and more. DocLearn AI fetches each section
            and transforms it into an interactive lesson with explanations,
            working code, and practice challenges.
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
            {[
              ["📖", "Concept explanations from first principles"],
              ["🔨", "Complete, runnable code examples"],
              ["🧪", "Hands-on practice challenges"],
              ["⚡", "Quick reference for each section"],
            ].map(([icon, text]) => (
              <div
                key={text}
                className="flex items-center gap-2.5 bg-white rounded-xl p-3.5 border border-slate-200 text-left"
              >
                <span className="text-xl flex-shrink-0">{icon}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
          <p className="mt-8 text-xs text-slate-400">
            Try:{" "}
            <button
              className="text-indigo-500 hover:underline"
              onClick={() => {
                setUrl("https://langchain-ai.github.io/langgraph/tutorials/introduction/");
              }}
            >
              LangGraph intro
            </button>{" "}
            ·{" "}
            <button
              className="text-indigo-500 hover:underline"
              onClick={() => setUrl("https://kubernetes.io/docs/tutorials/")}
            >
              Kubernetes tutorials
            </button>{" "}
            ·{" "}
            <button
              className="text-indigo-500 hover:underline"
              onClick={() => setUrl("https://fastapi.tiangolo.com/tutorial/")}
            >
              FastAPI tutorial
            </button>
          </p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* ── Sidebar ── */}
          <aside className="w-72 bg-white border-r border-slate-200 overflow-y-auto flex-shrink-0">
            {loadingOutline ? (
              <div className="p-6 text-center mt-8">
                <Spinner className="h-6 w-6 border-indigo-500 mx-auto mb-3" />
                <p className="text-sm text-slate-500">
                  Reading docs structure…
                </p>
              </div>
            ) : outline ? (
              <div className="p-4">
                <div className="mb-5 pb-4 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900 leading-snug">
                    {outline.title}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {outline.description}
                  </p>
                  <p className="text-xs text-indigo-500 mt-1.5 font-medium">
                    {outline.sections.length} sections
                  </p>
                </div>

                <nav className="space-y-0.5">
                  {outline.sections.map((section, i) => (
                    <button
                      key={i}
                      onClick={() => loadLesson(section, i)}
                      className={`w-full text-left rounded-lg text-sm transition-all ${
                        section.level === 2 ? "pl-7 pr-3 py-1.5" : "px-3 py-2"
                      } ${
                        i === currentIndex
                          ? "bg-indigo-50 text-indigo-700 font-medium"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {i === currentIndex && (
                          <span className="text-indigo-500">▶</span>
                        )}
                        <span
                          className={
                            section.level === 2 ? "text-xs" : undefined
                          }
                        >
                          {section.title}
                        </span>
                      </span>
                    </button>
                  ))}
                </nav>
              </div>
            ) : null}
          </aside>

          {/* ── Lesson content ── */}
          <main ref={mainRef} className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-8">
              {loadingLesson ? (
                <div className="text-center mt-24">
                  <Spinner className="h-8 w-8 border-indigo-500 mx-auto mb-4" />
                  <p className="text-slate-500 text-sm">
                    Fetching documentation…
                  </p>
                </div>
              ) : lesson ? (
                <>
                  {streaming && (
                    <div className="flex items-center gap-2 mb-4 text-xs text-indigo-500">
                      <Spinner className="h-3 w-3 border-indigo-500" />
                      Generating lesson…
                    </div>
                  )}
                  <MarkdownDisplay content={lesson} />

                  {/* Navigation */}
                  {!streaming && (
                    <div className="flex items-center justify-between mt-12 pt-6 border-t border-slate-200">
                      <button
                        onClick={handlePrev}
                        disabled={currentIndex <= 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        ← Previous
                      </button>

                      <span className="text-sm text-slate-400">
                        {currentIndex + 1} / {outline?.sections.length}
                      </span>

                      <button
                        onClick={handleNext}
                        disabled={
                          !outline ||
                          currentIndex >= outline.sections.length - 1
                        }
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              ) : outline ? (
                <div className="text-center mt-24 text-slate-400 text-sm">
                  Select a section from the sidebar to begin
                </div>
              ) : null}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

function Spinner({ className }: { className: string }) {
  return (
    <div
      className={`border-2 border-t-transparent rounded-full animate-spin ${className}`}
    />
  );
}
