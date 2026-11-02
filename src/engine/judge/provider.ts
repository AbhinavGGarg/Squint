/**
 * Provider-agnostic LLM access. No SDKs: plain fetch to each vendor's HTTP API,
 * so the dependency surface stays tiny and the key is the only config.
 *
 *   SQUINT_LLM_PROVIDER = anthropic | openai | none   (default: auto-detect from keys)
 *   ANTHROPIC_API_KEY / OPENAI_API_KEY
 *   SQUINT_LLM_MODEL   (optional override)
 */
export interface JudgeMessage {
  system: string;
  user: string;
  imagePngBase64?: string;
  maxTokens?: number;
}

export interface Provider {
  name: string;
  model: string;
  complete(msg: JudgeMessage): Promise<string>;
}

export function resolveProvider(): Provider | null {
  const pref = (process.env.SQUINT_LLM_PROVIDER || "").toLowerCase();
  const anth = process.env.ANTHROPIC_API_KEY;
  const oai = process.env.OPENAI_API_KEY;
  if (pref === "none") return null;
  if (pref === "mock") return mock();
  if ((pref === "anthropic" || !pref) && anth) return anthropic(anth, process.env.SQUINT_LLM_MODEL || "claude-sonnet-4-5");
  if ((pref === "openai" || !pref) && oai) return openai(oai, process.env.SQUINT_LLM_MODEL || "gpt-4o");
  return null;
}

function anthropic(key: string, model: string): Provider {
  return {
    name: "anthropic",
    model,
    async complete(msg) {
      const content: unknown[] = [];
      if (msg.imagePngBase64) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: msg.imagePngBase64 } });
      content.push({ type: "text", text: msg.user });
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: msg.maxTokens ?? 3000, system: msg.system, messages: [{ role: "user", content }] }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const j = (await res.json()) as { content: { type: string; text?: string }[] };
      return j.content.filter((c) => c.type === "text").map((c) => c.text || "").join("");
    },
  };
}

function openai(key: string, model: string): Provider {
  return {
    name: "openai",
    model,
    async complete(msg) {
      const content: unknown[] = [{ type: "text", text: msg.user }];
      if (msg.imagePngBase64) content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${msg.imagePngBase64}` } });
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, max_tokens: msg.maxTokens ?? 3000, messages: [{ role: "system", content: msg.system }, { role: "user", content }] }),
      });
      if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const j = (await res.json()) as { choices: { message: { content: string } }[] };
      return j.choices[0]?.message?.content || "";
    },
  };
}

/** Deterministic canned answer so the UI and parsing can be exercised without a key. */
function mock(): Provider {
  return {
    name: "mock",
    model: "canned",
    async complete() {
      return JSON.stringify({
        tenSecondTest: { whatIsThis: "A student's project page about a hackathon club.", whoIsItFor: "Unclear from the first screen; probably recruiters or admissions.", whyCare: "nothing specific", passed: false, score: 35, missing: ["what the person is notable for", "what to do next (contact? projects?)"] },
        genericCopy: [{ quote: "so people at my school could build a project and then present it to a room", why: "Describes any hackathon club; no number, no outcome.", rewrite: "Falcon Hacks: 40 students, 11 shipped projects, first school hackathon in May." }],
        tailoredAdvice: [{ title: "Lead with the number", why: "A recruiter gives this page 7 seconds; the 500K-view edit and the club you founded are the two notable facts and neither is in the first screen.", fix: "Move 'Founded Falcon Hacks' and '1.4M views' into the first paragraph." }],
        critiques: [{ expectedStandard: "The expected standard is that the most important information is the most prominent.", currentDesign: "In the current design, the Role/Org card gets more space than the paragraph that explains what you did.", fix: "To fix this, shrink the card to its content and move it below the paragraph." }],
      });
    },
  };
}
