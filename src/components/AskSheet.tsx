import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Sparkles, ArrowUp, ChevronRight } from "lucide-react";
import { SUGGESTED_QUESTIONS, type AskContext, type AskAnswer } from "../lib/ask";
import { askAgent, type AgentSource } from "../lib/agent";
import { HelmMark } from "./Brand";
import { cx } from "./ui";

interface Msg {
  id: string;
  role: "user" | "helm";
  text: string;
  answer?: AskAnswer;
  source?: AgentSource;
  pending?: boolean;
}

export function AskSheet({
  ctx,
  onClose,
  onOpenBusiness,
}: {
  ctx: AskContext;
  onClose: () => void;
  onOpenBusiness: (id: string) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function ask(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setBusy(true);
    const id = `m${++seq.current}`;
    setMsgs((m) => [
      ...m,
      { id: `${id}u`, role: "user", text: t },
      { id, role: "helm", text: "", pending: true },
    ]);
    // Stream from Claude when available; the rule engine is the built-in fallback.
    const res = await askAgent(t, ctx, (soFar) => {
      setMsgs((m) => m.map((msg) => (msg.id === id ? { ...msg, text: soFar, pending: false } : msg)));
    });
    setMsgs((m) =>
      m.map((msg) =>
        msg.id === id
          ? {
              ...msg,
              text: res.text || msg.text,
              source: res.source,
              answer: res.source === "rules" ? res : undefined,
              pending: false,
            }
          : msg,
      ),
    );
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-[60] mx-auto flex max-w-[440px] flex-col bg-[#0a0b10]">
      <div className="flex items-center gap-3 px-4 pb-3 pt-5">
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] active:scale-90">
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="flex items-center gap-2">
          <HelmMark size={20} className="text-violet-300" />
          <h1 className="text-[16px] font-bold text-white">Ask Helm</h1>
        </div>
      </div>

      <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        {msgs.length === 0 && (
          <div className="pt-5">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-500/15">
              <Sparkles size={22} className="text-violet-300" />
            </div>
            <h2 className="mt-4 text-[20px] font-bold tracking-tight text-white">Ask anything about your empire</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-white/50">
              Real answers from your live numbers — sales, profit, net worth, and where to put your cash.
            </p>
            <div className="mt-5 space-y-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  className="flex w-full items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-left active:scale-[0.99]"
                >
                  <span className="text-[14px] font-medium text-white/85">{q}</span>
                  <ChevronRight size={16} className="text-white/25" />
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-white px-3.5 py-2.5 text-[14px] font-medium text-black">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2.5">
              <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-violet-500/15">
                <HelmMark size={15} className="text-violet-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="rounded-2xl rounded-tl-md border border-white/[0.07] bg-white/[0.03] px-3.5 py-3">
                  {m.answer?.metric && (
                    <div
                      className={cx(
                        "mb-1 text-[20px] font-bold tracking-tight tabular-nums",
                        m.answer.metricUp === false ? "text-rose-400" : "text-white",
                      )}
                    >
                      {m.answer.metric}
                    </div>
                  )}
                  {m.pending && !m.text ? (
                    <Typing />
                  ) : (
                    <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-white/80">{m.text}</p>
                  )}
                  {m.answer?.businessId && (
                    <button
                      onClick={() => onOpenBusiness(m.answer!.businessId!)}
                      className="mt-2 inline-flex items-center gap-0.5 text-[12px] font-semibold text-violet-300"
                    >
                      Open <ChevronRight size={13} />
                    </button>
                  )}
                </div>
                {m.source && !m.pending && (
                  <p className="mt-1 pl-1 text-[10px] font-medium text-white/30">
                    {m.source === "claude" ? "Claude · grounded in your numbers" : "Offline · rule engine"}
                  </p>
                )}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-white/[0.07] px-4 pb-6 pt-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] py-1.5 pl-4 pr-1.5"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Helm anything…"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/30"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-black active:scale-90 disabled:opacity-40"
          >
            <ArrowUp size={18} strokeWidth={2.6} />
          </button>
        </form>
      </div>
    </div>
  );
}

/** Three-dot "thinking" indicator shown while the first token is in flight. */
function Typing() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </span>
  );
}
