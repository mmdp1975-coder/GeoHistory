export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (process.env.NODE_ENV !== "production") {
    const safeKey = apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : "missing";
    console.log("[TTS] OPENAI_API_KEY", safeKey, "len", apiKey?.length ?? 0);
  }
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  const lang = typeof payload?.lang === "string" ? payload.lang.trim() : "";
  const voice = typeof payload?.voice === "string" ? payload.voice.trim() : "";
  const tone = typeof payload?.tone === "string" ? payload.tone.trim() : "";

  if (!text) {
    return new Response(JSON.stringify({ error: "Missing text" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!lang || (lang !== "it" && lang !== "en")) {
    return new Response(JSON.stringify({ error: "Invalid lang" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!voice) {
    return new Response(JSON.stringify({ error: "Missing voice" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const instructions = tone ? `Tone: ${tone}` : undefined;

  const baseBody: Record<string, any> = {
    model,
    voice,
    input: text,
    response_format: "mp3",
  };

  try {
    const callOpenAI = async (body: Record<string, any>) => {
      const apiRes = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: req.signal,
      });
      if (!apiRes.ok) {
        const errText = await apiRes.text();
        return { ok: false as const, status: apiRes.status, errText };
      }
      const arrayBuffer = await apiRes.arrayBuffer();
      return { ok: true as const, arrayBuffer };
    };

    let body: Record<string, any> = { ...baseBody };
    if (instructions) body.instructions = instructions;

    let result = await callOpenAI(body);
    if (!result.ok && instructions) {
      const shouldRetry =
        result.status === 400 &&
        /instructions|unknown parameter|unsupported/i.test(result.errText || "");
      if (shouldRetry) {
        body = { ...baseBody };
        result = await callOpenAI(body);
      }
    }

    if (!result.ok) {
      return new Response(
        JSON.stringify({
          error: "OpenAI TTS error",
          detail: result.errText,
          status: result.status,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(result.arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: "OpenAI TTS error",
        detail: err?.message || String(err),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
