# FILE: frontend/PROMPT/new_journey.py
#
# USO:
# python new_journey.py --title "La Civiltà della Mesopotamia" --audience "Ragazzi 11-14" --style "Avventuroso divulgativo"
#
# OUTPUT:
# ~/Downloads/La_Civilta_della_Mesopotamia.xlsx

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from openai import OpenAI

# =========================
# PATH
# =========================
BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR.parent / ".env.local"

# =========================
# ENV
# =========================

def load_env_file(path: Path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key:
            os.environ[key] = value

load_env_file(ENV_PATH)
PROMPT_1_PATH = BASE_DIR / "PROMPT_1.txt"
PROMPT_2_PATH = BASE_DIR / "PROMPT_2.txt"
PROMPT_3_PATH = BASE_DIR / "PROMPT_3.txt"
PROMPT_1_OUT_PATH = BASE_DIR / "OUTPUT_PROMPT_1.json"
PROMPT_2_OUT_PATH = BASE_DIR / "OUTPUT_PROMPT_2.json"

# =========================
# OPENAI
# =========================
MODEL = os.getenv("OPENAI_MODEL", "gpt-5")
client = OpenAI()

# =========================
# UTILS
# =========================
def read_text(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(f"Missing file: {path}")
    return path.read_text(encoding="utf-8").strip()

def extract_json(text: str) -> dict:
    t = text.strip()
    if t.startswith("TASK FAILED"):
        raise RuntimeError(f"{t} returned by model.")
    start = t.find("{")
    end = t.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON found in model output.")
    return json.loads(t[start:end + 1])

def responses_text(prompt: str) -> str:
    resp = client.responses.create(
        model=MODEL,
        input=[{"role": "user", "content": prompt}]
    )
    out = []
    for item in resp.output:
        if item.type == "message":
            for c in item.content:
                if c.type == "output_text":
                    out.append(c.text)
    return "\n".join(out).strip()

def responses_json(prompt: str) -> dict:
    return extract_json(responses_text(prompt))

# =========================
# PIPELINE
# =========================


STATUS_FILE: Path | None = None


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_status(payload: dict):
    if not STATUS_FILE:
        return
    try:
        STATUS_FILE.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def log_stage(stage: str):
    print(f"STAGE:{stage}", flush=True)
    write_status({"status": "running", "stage": stage, "updated_at": utc_timestamp()})

def run_prompt_1(title: str):
    p1 = read_text(PROMPT_1_PATH)
    log_stage("PROMPT_1_START")
    prompt1 = p1.replace("<INSERISCI TITOLO DEL JOURNEY>", title)
    json_a = extract_json(responses_text(prompt1))
    try:
        PROMPT_1_OUT_PATH.write_text(json.dumps(json_a, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass
    log_stage("PROMPT_1_DONE")
    return json_a

def run_prompt_2(audience: str, style: str, json_a: dict):
    p2 = read_text(PROMPT_2_PATH)
    log_stage("PROMPT_2_START")
    prompt2 = (
        p2.replace("<INSERISCI TARGET DALLA UI>", audience)
          .replace("<INSERISCI STILE DALLA UI>", style)
        + "\n\nJSON_INPUT_PROMPT_1=\n"
        + json.dumps(json_a, ensure_ascii=False)
    )
    json_b = extract_json(responses_text(prompt2))
    try:
        PROMPT_2_OUT_PATH.write_text(json.dumps(json_b, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass
    log_stage("PROMPT_2_DONE")
    return json_b

def run_prompt_3(json_b: dict):
    p3 = read_text(PROMPT_3_PATH)
    log_stage("PROMPT_3_START")
    prompt3 = (
        p3
        + "\n\nJSON_INPUT_PROMPT_2=\n"
        + json.dumps(json_b, ensure_ascii=False)
    )
    log_stage("PROMPT_3_DONE")
    json_c = responses_json(prompt3)
    log_stage("JSON_OUTPUT_READY")
    return json_c

def run_pipeline(title: str, audience: str, style: str):
    json_a = run_prompt_1(title)
    json_b = run_prompt_2(audience, style, json_a)
    return run_prompt_3(json_b)

# =========================
# CLI
# =========================
def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    parser = argparse.ArgumentParser()
    parser.add_argument("--title", required=True)
    parser.add_argument("--audience", required=True)
    parser.add_argument("--style", required=True)
    parser.add_argument("--status-file")
    parser.add_argument("--step", choices=["1", "2", "3"])
    args = parser.parse_args()

    global STATUS_FILE
    if args.status_file:
        STATUS_FILE = Path(args.status_file)

    try:
        if args.step == "1":
            payload = run_prompt_1(args.title)
        elif args.step == "2":
            if not PROMPT_1_OUT_PATH.exists():
                raise RuntimeError("Missing OUTPUT_PROMPT_1.json")
            json_a = json.loads(PROMPT_1_OUT_PATH.read_text(encoding="utf-8"))
            payload = run_prompt_2(args.audience, args.style, json_a)
        elif args.step == "3":
            if not PROMPT_2_OUT_PATH.exists():
                raise RuntimeError("Missing OUTPUT_PROMPT_2.json")
            json_b = json.loads(PROMPT_2_OUT_PATH.read_text(encoding="utf-8"))
            payload = run_prompt_3(json_b)
        else:
            payload = run_pipeline(args.title, args.audience, args.style)
        write_status({"status": "done", "stage": "done", "updated_at": utc_timestamp()})
        print("JSON_RESULT:" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    except Exception as exc:
        write_status({"status": "error", "stage": "error", "error": str(exc), "updated_at": utc_timestamp()})
        raise

if __name__ == "__main__":
    main()
