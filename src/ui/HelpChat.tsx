import { useState } from "react";
import type { ForecastResult } from "../types.ts";
import { askHelp, buildChatContext, fallbackHelp, type ChatMsg } from "../engine/chat.ts";
import { appendLog } from "../engine/log.ts";

const PROMPTS = [
  "What should I do?",
  "Where should I go next?",
  "Which roads are flooded?",
  "Is my way clear?",
];

type Props = {
  cityName: string;
  you: string;
  result: ForecastResult;
  lastTrip: string | null;
};

export function HelpChat({ cityName, you, result, lastTrip }: Props) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    {
      role: "assistant",
      text: "Ask what to do or where to go next. I only use the flood model on this map.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setDraft("");
    const next = [...msgs, { role: "user" as const, text: q }];
    setMsgs(next);
    setBusy(true);
    const ctx = buildChatContext(cityName, you, result, lastTrip);
    const flooded = result.points.filter((p) => p.onsetStep !== null);
    const clear = result.points.filter((p) => p.onsetStep === null);
    const spoken = await askHelp(q, next, ctx);
    const reply =
      spoken ??
      fallbackHelp({
        flooded,
        clear,
        you,
      });
    setMsgs([...next, { role: "assistant", text: reply }]);
    appendLog("chat", q, reply);
    setBusy(false);
  }

  return (
    <section className="chat">
      <h2>Ask Neeru</h2>
      <p className="muted">What should I do. Where should I go next. Answers come from this map, not a general chatbot.</p>
      <div className="chips">
        {PROMPTS.map((p) => (
          <button key={p} type="button" className="chip dark" onClick={() => void send(p)}>
            {p}
          </button>
        ))}
      </div>
      <ol className="chat-log">
        {msgs.map((m, i) => (
          <li key={i} data-role={m.role}>
            <span>{m.role === "user" ? "You" : "Neeru"}</span>
            <p>{m.text}</p>
          </li>
        ))}
      </ol>
      <form
        className="city-search"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What should I do?"
          aria-label="Help question"
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "..." : "Ask"}
        </button>
      </form>
    </section>
  );
}
