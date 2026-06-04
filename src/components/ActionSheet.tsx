import { useEffect, useState } from "react";
import { ChevronLeft, Send, Sparkles } from "lucide-react";
import type { Insight } from "../types";
import { draftAction, type AgentSource } from "../lib/agent";
import type { AskContext } from "../lib/ask";
import { HelmMark } from "./Brand";

/**
 * Agentic action: Claude drafts the artifact for an actionable insight (the text to the
 * manager, the reorder note, the cash-move rationale), the owner reviews/edits it, then
 * sends it themselves. We never send or move money — the draft is the AI part; the send
 * is human-in-the-loop. Offline (no key) it degrades to the simulated "mark done".
 */
export function ActionSheet({
  insight,
  ctx,
  onClose,
  onToast,
}: {
  insight: Insight;
  ctx: AskContext;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const action = insight.action?.label ?? "this";
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<AgentSource>("rules");

  useEffect(() => {
    let alive = true;
    draftAction(action, insight, ctx).then((d) => {
      if (!alive) return;
      if (d) {
        setText(d);
        setSource("claude");
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = () => {
    onToast(insight.action?.done ?? "Done ✓");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] mx-auto flex max-w-[440px] flex-col bg-[#0a0b10]">
      <div className="flex items-center gap-3 px-4 pb-3 pt-5">
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] active:scale-90">
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="flex items-center gap-2">
          <HelmMark size={18} className="text-violet-300" />
          <h1 className="text-[16px] font-bold text-white">{insight.action?.label ?? "Draft"}</h1>
        </div>
      </div>

      <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <p className="px-1 text-[13px] leading-relaxed text-white/50">{insight.title}</p>

        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-5 text-[13px] text-white/55">
            <Sparkles size={15} className="animate-pulse text-violet-300" />
            Drafting with the real numbers…
          </div>
        ) : source === "claude" ? (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 px-1">
              <Sparkles size={13} className="text-violet-300" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-violet-300">Claude drafted · edit before you send</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(16, Math.max(5, text.split("\n").length + 2))}
              className="w-full resize-none rounded-2xl border border-white/[0.09] bg-white/[0.04] p-3.5 text-[13.5px] leading-relaxed text-white/90 outline-none focus:border-violet-400/40"
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-[13px] leading-relaxed text-white/70">
            Helm drafts this with Claude — it's offline right now. Add an Anthropic API key in
            Settings to have it write the message for you. You can still mark the action done.
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.07] px-4 pb-7 pt-3">
        <button
          onClick={send}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-[14px] font-bold text-black active:scale-[0.98]"
        >
          <Send size={16} strokeWidth={2.4} />
          {source === "claude" ? "Send it" : "Mark done"}
        </button>
        <p className="mt-2 text-center text-[11px] text-white/30">
          Helm never sends or moves money — you stay in control.
        </p>
      </div>
    </div>
  );
}
