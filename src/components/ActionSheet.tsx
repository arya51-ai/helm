import { useEffect, useState } from "react";
import { ChevronLeft, Send, Sparkles } from "lucide-react";
import type { Insight } from "../types";
import { draftAction, type AgentSource } from "../lib/agent";
import type { AskContext } from "../lib/ask";
import { add as addAction, type ActionKind } from "../data/actions";
import { HelmMark } from "./Brand";

/**
 * Bucket an insight into the kind of artifact it produces, so the tracked action reads
 * cleanly in the open-loops list and we can pick the right native composer.
 */
function actionKindFor(insight: Insight): ActionKind {
  if (insight.kind === "capital") return "capital";
  const label = `${insight.action?.label ?? ""} ${insight.title}`.toLowerCase();
  if (/\b(reorder|order|restock|stock|inventory|par)\b/.test(label)) return "reorder";
  if (/\b(text|message|email|call|tell|ask|remind|send)\b/.test(label)) return "message";
  return "task";
}

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
    // Offline (no Claude draft): nothing to send — keep the simulated "mark done".
    if (source !== "claude") {
      onToast(insight.action?.done ?? "Done ✓");
      onClose();
      return;
    }

    // Real send: record the drafted artifact as a tracked, sent action so the brief
    // can close the loop later. Helm still never sends for you — we just log it and,
    // where there's a human on the other end, open the native composer prefilled.
    const kind = actionKindFor(insight);
    addAction({
      businessId: insight.businessId,
      insightTitle: insight.title,
      draftText: text,
      kind,
      status: "sent",
    });

    if (kind === "message" || kind === "reorder") {
      const body = encodeURIComponent(text);
      // No recipient on file in the prototype — open unaddressed so the owner picks who.
      const href =
        kind === "reorder"
          ? `mailto:?subject=${encodeURIComponent(insight.action?.label ?? "Reorder")}&body=${body}`
          : `sms:?&body=${body}`;
      try {
        window.location.href = href;
      } catch {
        /* composer unavailable (desktop / blocked) — the action is still tracked */
      }
    }

    onToast("Sent · tracking until it's done");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] mx-auto flex max-w-[440px] flex-col bg-[#0a263e]">
      <div className="flex items-center gap-3 px-4 pb-3 pt-5">
        <button aria-label="Close" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] active:scale-90">
          <ChevronLeft size={20} className="text-white" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2">
          <HelmMark size={18} className="text-brass" />
          <h1 className="text-[16px] font-bold text-white">{insight.action?.label ?? "Draft"}</h1>
        </div>
      </div>

      <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <p className="px-1 text-[13px] leading-relaxed text-white/50">{insight.title}</p>

        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-5 text-[13px] text-white/55">
            <Sparkles size={15} className="animate-pulse text-brass" />
            Drafting with the real numbers…
          </div>
        ) : source === "claude" ? (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 px-1">
              <Sparkles size={13} className="text-brass" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-brass">Claude drafted · edit before you send</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(16, Math.max(5, text.split("\n").length + 2))}
              className="w-full resize-none rounded-2xl border border-white/[0.09] bg-white/[0.04] p-3.5 text-[13.5px] leading-relaxed text-white/90 outline-none focus:border-brass/40"
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-brass/20 bg-brass/[0.06] p-4 text-[13px] leading-relaxed text-white/70">
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
          <Send size={16} strokeWidth={2.4} aria-hidden="true" />
          {source === "claude" ? "Send it" : "Mark done"}
        </button>
        <p className="mt-2 text-center text-[11px] text-white/30">
          Helm never sends or moves money — you stay in control.
        </p>
      </div>
    </div>
  );
}
