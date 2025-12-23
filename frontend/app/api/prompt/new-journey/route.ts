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
  style?: string;
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
  const style = payload.style?.trim();
  const step = payload.step;

  if (!title || !audience || !style) {
    return NextResponse.json({ error: "Missing title, audience, or style." }, { status: 400 });
  }

  const scriptPath = buildScriptPath();
  const jobId = crypto.randomUUID();
  const args = [scriptPath, "--title", title, "--audience", audience, "--style", style];
  if (step) {
    args.push("--step", step);
  }

  let stdout = "";
  let stderr = "";

  const child = spawn(process.env.PYTHON_BIN || "python", args, { shell: false });

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
    const jsonMatch = stdout.match(/JSON_RESULT:(.+)$/m);
    let payload: Record<string, unknown> | null = null;
    if (jsonMatch?.[1]) {
      try {
        payload = JSON.parse(jsonMatch[1]);
      } catch (err) {
        updateJobStatus(jobId, {
          status: "error",
          error: "Invalid JSON_RESULT payload.",
          stage: parseStage(stdout),
          stdout,
          stderr,
        });
        return;
      }
    }
    updateJobStatus(jobId, {
      status: "done",
      stage: "done",
      message: "JSON pronto.",
      payload,
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
