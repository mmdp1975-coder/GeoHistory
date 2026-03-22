import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import { requireAdmin } from "@/lib/api/adminAuth";

export const runtime = "nodejs";

type ReelPayload = {
  title?: string;
};

type ReelJobStatus = {
  status: "running" | "done" | "error";
  stage?: string | null;
  stdout?: string;
  stderr?: string;
  error?: string;
  message?: string;
  outputPath?: string | null;
  updatedAt?: string;
};

const jobStatusStore = new Map<string, ReelJobStatus>();

const updateJobStatus = (jobId: string, patch: Partial<ReelJobStatus>) => {
  const prev = jobStatusStore.get(jobId) ?? { status: "running" };
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() } as ReelJobStatus;
  jobStatusStore.set(jobId, next);
  return next;
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

const resolveMainScriptPath = () => {
  const baseDir = process.cwd();
  const local = path.join(baseDir, "main.py");
  if (existsSync(local)) return local;
  return path.join(baseDir, "frontend", "main.py");
};

const parseOutputPath = (stdout: string) => {
  const marker = "FINAL_VIDEO:";
  const idx = stdout.lastIndexOf(marker);
  if (idx === -1) return null;
  return stdout.slice(idx + marker.length).trim() || null;
};

const parseStage = (stdout?: string | null) => {
  if (!stdout) return null;
  const lines = stdout.split(/\r?\n/).map((line) => line.trim());
  const markers = lines.filter((line) => line.startsWith("STAGE:"));
  if (!markers.length) return null;
  return markers[markers.length - 1].replace("STAGE:", "").trim().toLowerCase();
};

export async function POST(req: Request) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  let payload: ReelPayload = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = payload.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "Missing title." }, { status: 400 });
  }

  const scriptPath = resolveMainScriptPath();
  if (!existsSync(scriptPath)) {
    return NextResponse.json({ error: `Missing script: ${scriptPath}` }, { status: 500 });
  }

  const jobId = crypto.randomUUID();
  const args = [scriptPath, title];
  let stdout = "";
  let stderr = "";

  const child = spawn(resolvePythonBin(), args, { shell: false });
  updateJobStatus(jobId, { status: "running", stage: "start", stdout: "", stderr: "" });

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
    updateJobStatus(jobId, {
      status: "running",
      stage: parseStage(stdout) ?? jobStatusStore.get(jobId)?.stage ?? "running",
      stdout,
    });
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
    updateJobStatus(jobId, { status: "running", stderr });
  });

  child.on("error", (err) => {
    updateJobStatus(jobId, {
      status: "error",
      stage: parseStage(stdout) ?? "error",
      error: err?.message || "Execution error",
      stdout,
      stderr,
    });
  });

  child.on("close", (code) => {
    if (code !== 0) {
      updateJobStatus(jobId, {
        status: "error",
        stage: parseStage(stdout) ?? "error",
        error: stderr || "Reel generation failed.",
        stdout,
        stderr,
      });
      return;
    }

    const outputPath = parseOutputPath(stdout);
    updateJobStatus(jobId, {
      status: "done",
      stage: "done",
      message: "Reel generated.",
      outputPath,
      stdout,
      stderr,
    });
  });

  return NextResponse.json({ ok: true, jobId });
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

  return NextResponse.json({ ok: true, jobId, ...data });
}

