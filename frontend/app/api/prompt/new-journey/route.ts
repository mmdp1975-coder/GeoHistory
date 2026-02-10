import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import { requireAdmin } from "@/lib/api/adminAuth";

export const runtime = "nodejs";

type PromptPayload = {
  title?: string;
  audience?: string;
  styles?: string[];
  detailLevel?: string;
  eventGuideline?: string;
  step?: "1" | "2" | "3";
};

type JobStatus = {
  status: "running" | "done" | "error";
  stage?: string | null;
  stdout?: string;
  stderr?: string;
  error?: string;
  message?: string;
  payload?: Record<string, unknown> | null;
  style_rules?: string | null;
  updatedAt?: string;
};

const jobStatusStore = new Map<string, JobStatus>();

const parseStage = (stdout?: string | null) => {
  if (!stdout) return null;
  const lines = stdout.split(/\r?\n/).map((line) => line.trim());
  const markers = lines.filter((line) => line.startsWith("STAGE:"));
  if (markers.length === 0) return null;
  const last = markers[markers.length - 1].replace("STAGE:", "").trim();
  const key = last.toUpperCase();
  if (key.startsWith("PROMPT_1")) return "prompt_1";
  if (key.startsWith("PROMPT_2")) return "prompt_2";
  if (key.startsWith("PROMPT_3")) return "prompt_3";
  if (key.startsWith("JSON_OUTPUT")) return "json";
  return null;
};

const parseJsonResult = (stdout?: string | null) => {
  if (!stdout) return { payload: null as Record<string, unknown> | null };
  const marker = "JSON_RESULT:";
  const markerIndex = stdout.lastIndexOf(marker);
  if (markerIndex === -1) return { payload: null as Record<string, unknown> | null };
  const raw = stdout.slice(markerIndex + marker.length).trim();
  if (!raw) return { payload: null as Record<string, unknown> | null };
  const tryParse = (text: string) => JSON.parse(text) as Record<string, unknown>;
  try {
    return { payload: tryParse(raw) };
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return { payload: tryParse(raw.slice(start, end + 1)) };
      } catch {
        // fall through to error below
      }
    }
    return { payload: null as Record<string, unknown> | null, error: "Invalid JSON_RESULT payload." };
  }
};

const parseStyleRules = (stdout?: string | null) => {
  if (!stdout) return null;
  const marker = "STYLE_RULES:";
  const idx = stdout.lastIndexOf(marker);
  if (idx === -1) return null;
  const raw = stdout.slice(idx + marker.length).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { rules?: string };
    return typeof parsed.rules === "string" ? parsed.rules : null;
  } catch {
    return null;
  }
};

const updateJobStatus = (jobId: string, patch: Partial<JobStatus>) => {
  const prev = jobStatusStore.get(jobId) ?? { status: "running" };
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() } as JobStatus;
  jobStatusStore.set(jobId, next);
  return next;
};

const buildScriptPath = () => {
  const baseDir = process.cwd();
  const localPath = path.join(baseDir, "PROMPT", "new_journey.py");
  if (existsSync(localPath)) {
    return localPath;
  }
  return path.join(baseDir, "frontend", "PROMPT", "new_journey.py");
};

const resolvePythonBin = () => {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const baseDir = process.cwd();
  const venvWin = path.join(baseDir, ".venv", "Scripts", "python.exe");
  if (existsSync(venvWin)) return venvWin;
  const venvUnix = path.join(baseDir, ".venv", "bin", "python");
  if (existsSync(venvUnix)) return venvUnix;
  return "python";
};

export async function POST(req: Request) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  let payload: PromptPayload = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = payload.title?.trim();
  const audience = payload.audience?.trim();
  const styles = Array.isArray(payload.styles) ? payload.styles.map((s) => s?.trim()).filter(Boolean) : [];
  const detailLevel = payload.detailLevel?.trim();
  const step = payload.step;
  const eventGuideline = payload.eventGuideline?.trim();

  if (!title || !audience || styles.length === 0 || !detailLevel || !eventGuideline) {
    return NextResponse.json({ error: "Missing title, audience, styles, detail level, or event guideline." }, { status: 400 });
  }

  const scriptPath = buildScriptPath();
  const jobId = crypto.randomUUID();
  const args = [scriptPath, "--title", title, "--audience", audience];
  args.push("--styles", styles.join(", "));
  args.push("--detail-level", detailLevel);
  if (eventGuideline) {
    args.push("--event-guideline", eventGuideline);
  }
  if (step) {
    args.push("--step", step);
  }

  let stdout = "";
  let stderr = "";

  const child = spawn(resolvePythonBin(), args, { shell: false });

  const initialStage = step === "2" ? "prompt_2" : step === "3" ? "prompt_3" : "prompt_1";
  updateJobStatus(jobId, { status: "running", stage: initialStage, stdout: "", stderr: "" });

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
    const stage = parseStage(stdout) ?? jobStatusStore.get(jobId)?.stage ?? null;
    updateJobStatus(jobId, { status: "running", stage, stdout });
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
    updateJobStatus(jobId, { status: "running", stderr });
  });

  child.on("error", (err) => {
    updateJobStatus(jobId, { status: "error", error: err?.message || "Prompt execution error." });
  });

  child.on("close", (code) => {
    if (code !== 0) {
      updateJobStatus(jobId, {
        status: "error",
        error: stderr || "Prompt execution failed.",
        stage: parseStage(stdout),
        stdout,
        stderr,
      });
      return;
    }
    const { payload, error } = parseJsonResult(stdout);
    const styleRules = parseStyleRules(stdout);
    if (error) {
      updateJobStatus(jobId, {
        status: "error",
        error,
        stage: parseStage(stdout),
        stdout,
        stderr,
      });
      return;
    }
    updateJobStatus(jobId, {
      status: "done",
      stage: "done",
      message: "JSON pronto.",
      payload,
      ...(styleRules ? { style_rules: styleRules } : {}),
      stdout,
      stderr,
    });
  });

  return NextResponse.json({ ok: true, jobId, step });
}

export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId." }, { status: 400 });
  }

  const data = jobStatusStore.get(jobId);
  if (!data) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ...data, jobId });
}
