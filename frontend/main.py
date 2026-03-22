import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

try:
    from openai import OpenAI
except Exception:
    OpenAI = None


BASE_DIR = Path(__file__).resolve().parent
PROMPT_PATH = BASE_DIR / "prompts" / "reel_prompt.txt"
OUTPUT_DIR = BASE_DIR / "output"
WINDOWS_FONT = Path("C:/Windows/Fonts/arial.ttf")


def log_stage(name: str) -> None:
    print(f"STAGE:{name}", flush=True)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


def safe_title(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", value.strip())
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned or "reel"


def drawtext_filter(text: str, fontsize: int, y_expr: str) -> str:
    safe = (text or "").replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    font_part = ""
    if WINDOWS_FONT.exists():
        font_part = f"fontfile='{str(WINDOWS_FONT).replace(':', '\\:')}':"
    return (
        "drawtext="
        f"{font_part}"
        f"fontcolor=white:fontsize={fontsize}:x=(w-text_w)/2:y={y_expr}:"
        f"text='{safe}'"
    )


def read_prompt_template() -> str:
    if not PROMPT_PATH.exists():
        raise FileNotFoundError(f"Missing prompt file: {PROMPT_PATH}")
    return PROMPT_PATH.read_text(encoding="utf-8")


def extract_json(text: str) -> dict[str, Any]:
    raw = text.strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Model response does not contain JSON.")
    return json.loads(raw[start : end + 1])


def fallback_structure(title: str) -> dict[str, Any]:
    return {
        "event_1": f"{title} (primary event)",
        "event_1_year": "1914",
        "event_1_location": "Europe",
        "event_2": "A truly contemporary event in the same period",
        "event_2_year": "1914",
        "event_2_location": "South America",
        "hook_question_en": f"What if {title} changed history more than we think?",
        "overlap_period": "1914",
        "reel_blocks": [
            {
                "block": 1,
                "title": "Hook",
                "text_en": f"{title} - Why did this moment reshape the world?",
                "voiceover_en": f"What if one event could change the direction of history? Let's start with {title}.",
                "visual_prompt_en": f"Cinematic vertical scene representing {title}, dramatic, realistic, high contrast.",
            },
            {
                "block": 2,
                "title": "Connection",
                "text_en": "Now connect two distant places in the same historical time.",
                "voiceover_en": "Now we connect two places that lived history at the same time.",
                "visual_prompt_en": "Point-to-point global transition between two locations, cinematic map movement.",
            },
            {
                "block": 3,
                "title": "Contemporary Event",
                "text_en": "A second event unfolding in parallel.",
                "voiceover_en": "At the same time, another event was unfolding with equally deep consequences.",
                "visual_prompt_en": "Cinematic vertical historical reenactment for the second event, realistic lighting and motion.",
            },
            {
                "block": 4,
                "title": "CTA finale",
                "text_en": "Follow for more historical parallels.",
                "voiceover_en": "Follow for more historical parallels and timelines that connect the world.",
                "visual_prompt_en": "Strong cinematic closing frame, optimistic tone, subtle call-to-action visual.",
            },
        ],
        "music_mood_en": "warm cinematic documentary background, subtle and elegant",
    }


def generate_structure_with_openai(title: str, prompt_template: str) -> dict[str, Any]:
    if OpenAI is None or not os.getenv("OPENAI_API_KEY"):
        return fallback_structure(title)
    model = os.getenv("OPENAI_MODEL", "gpt-5")
    prompt = prompt_template.replace("{title}", title)
    client = OpenAI()
    response = client.responses.create(
        model=model,
        input=[{"role": "user", "content": prompt}],
    )
    chunks: list[str] = []
    for item in response.output:
        if item.type != "message":
            continue
        for content in item.content:
            if content.type == "output_text":
                chunks.append(content.text)
    text = "\n".join(chunks).strip()
    if not text:
        return fallback_structure(title)
    parsed = extract_json(text)
    if not isinstance(parsed.get("reel_blocks"), list) or len(parsed["reel_blocks"]) != 4:
        return fallback_structure(title)
    return parsed


def run_ffmpeg(args: list[str]) -> None:
    cmd = ["ffmpeg", "-y", *args]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg failed: {' '.join(cmd)}\n{proc.stderr}")


def ffmpeg_available() -> bool:
    try:
        proc = subprocess.run(["ffmpeg", "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
        return proc.returncode == 0
    except Exception:
        return False


def ensure_dirs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def normalize_blocks(data: dict[str, Any]) -> list[dict[str, Any]]:
    blocks = data.get("reel_blocks")
    if not isinstance(blocks, list):
        return fallback_structure(data.get("main_event") or "Evento")["reel_blocks"]
    out: list[dict[str, Any]] = []
    for idx in range(4):
        source = blocks[idx] if idx < len(blocks) and isinstance(blocks[idx], dict) else {}
        out.append(
            {
                "block": idx + 1,
                "title": str(source.get("title") or f"Blocco {idx + 1}"),
                "voiceover_en": str(source.get("voiceover_en") or source.get("voiceover") or ""),
                "text_en": str(source.get("text_en") or source.get("on_screen_text") or source.get("title") or f"Block {idx + 1}"),
                "visual_prompt_en": str(source.get("visual_prompt_en") or source.get("text_en") or source.get("on_screen_text") or source.get("title") or f"Block {idx + 1} visual"),
            }
        )
    return out


def build_sora_prompt(title: str, block: dict[str, Any], index: int) -> str:
    return (
        "Create a cinematic vertical social reel shot. "
        f"Reel title: {title}. "
        f"Block {index}: {block.get('title', '')}. "
        f"Visual brief: {block.get('visual_prompt_en', '')}. "
        "Historical, realistic style, smooth camera movement, no watermark, no subtitles baked in."
    )


def create_placeholder_video_clip(text: str, out_path: Path, duration_sec: int = 5) -> Path:
    filter_graph = "color=c=#111827:s=1080x1920"
    run_ffmpeg(
        [
            "-f",
            "lavfi",
            "-i",
            filter_graph,
            "-t",
            str(duration_sec),
            "-r",
            "30",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(out_path),
        ]
    )
    return out_path


def download_sora_clip(prompt: str, out_path: Path, seconds: str = "4") -> tuple[Path, str]:
    if OpenAI is None or not os.getenv("OPENAI_API_KEY"):
        return create_placeholder_video_clip("Sora asset placeholder", out_path, duration_sec=int(seconds)), "sora_fallback_placeholder"
    try:
        client = OpenAI()
        model = os.getenv("SORA_MODEL", "sora-2")
        video = client.videos.create_and_poll(
            model=model,
            prompt=prompt,
            seconds=seconds,
        )
        content = client.videos.download_content(video.id)
        if hasattr(content, "write_to_file"):
            content.write_to_file(str(out_path))
        elif hasattr(content, "content"):
            out_path.write_bytes(content.content)
        else:
            out_path.write_bytes(bytes(content))
        log_stage("SORA_DOWNLOAD_OK")
        return out_path, "sora_video"
    except Exception as exc:
        print(f"SORA_ERROR:{exc}", flush=True)
        log_stage("SORA_FALLBACK")
        return create_placeholder_video_clip("Sora asset fallback", out_path, duration_sec=int(seconds)), "sora_fallback_placeholder"


def resolve_google_earth_source() -> Path | None:
    explicit = os.getenv("GOOGLE_EARTH_STUDIO_AERIAL_MP4", "").strip()
    if explicit:
        p = Path(explicit)
        if p.exists() and p.is_file():
            return p
    asset_dir = os.getenv("GOOGLE_EARTH_STUDIO_ASSET_DIR", "").strip()
    if asset_dir:
        d = Path(asset_dir)
        if d.exists() and d.is_dir():
            candidates = sorted(d.glob("*.mp4"), key=lambda x: x.stat().st_mtime, reverse=True)
            if candidates:
                return candidates[0]
    return None


def get_google_earth_aerial_clip(out_path: Path, route_from: str, route_to: str, seconds: int = 5) -> tuple[Path, str]:
    source = resolve_google_earth_source()
    if source:
        shutil.copy2(source, out_path)
        return out_path, "google_earth_video"
    return create_placeholder_video_clip(f"Aerial {route_from} to {route_to}", out_path, duration_sec=seconds), "google_earth_placeholder"


def create_scene_video_assets(
    title: str,
    structure: dict[str, Any],
    safe: str,
    work_dir: Path,
    video_source: str,
    ges_from: str,
    ges_to: str,
) -> tuple[list[Path], list[dict[str, Any]]]:
    log_stage("ASSETS")
    blocks = normalize_blocks(structure)
    seconds = os.getenv("REEL_SCENE_SECONDS", "4").strip() or "4"
    if seconds not in {"4", "8", "12"}:
        seconds = "4"
    seconds_int = int(seconds)
    clips: list[Path] = []
    materials: list[dict[str, Any]] = []
    for idx, block in enumerate(blocks, start=1):
        clip_path = work_dir / f"{safe}_source_{idx:02d}.mp4"
        use_ges = False
        if video_source == "google_earth":
            use_ges = True
        elif video_source == "hybrid" and idx == 2:
            # In hybrid mode only the connector block uses aerial view.
            use_ges = True
        if use_ges:
            log_stage("GOOGLE_EARTH_STUDIO_AERIAL")
            asset, material_type = get_google_earth_aerial_clip(clip_path, ges_from, ges_to, seconds=seconds_int)
        else:
            log_stage(f"SORA_ASSET_{idx}")
            sora_prompt = build_sora_prompt(title, block, idx)
            asset, material_type = download_sora_clip(sora_prompt, clip_path, seconds=seconds)
        clips.append(asset)
        materials.append(
            {
                "block": idx,
                "title": block.get("title", f"Block {idx}"),
                "material_type": material_type,
                "path": str(asset),
            }
        )
    return clips, materials


def create_voiceover(structure: dict[str, Any], safe: str, work_dir: Path) -> tuple[Path, str]:
    log_stage("VOICEOVER")
    voiceover_path = work_dir / f"{safe}_voiceover.mp3"
    blocks = normalize_blocks(structure)
    script_text = " ".join(block.get("voiceover_en", "") for block in blocks).strip()
    if not script_text:
        script_text = "This historical reel was automatically generated."
    script_text = f"Voice style: warm, professional, confident. Language: English. {script_text}"

    if OpenAI is not None and os.getenv("OPENAI_API_KEY"):
        try:
            client = OpenAI()
            model = os.getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
            voice = os.getenv("OPENAI_TTS_VOICE", "alloy")
            with client.audio.speech.with_streaming_response.create(
                model=model,
                voice=voice,
                input=script_text,
                response_format="mp3",
            ) as audio_response:
                audio_response.stream_to_file(str(voiceover_path))
            return voiceover_path, "openai_tts"
        except Exception:
            pass

    # Fallback: generate silent track if TTS is unavailable.
    duration_sec = max(8, len(script_text.split()) // 2)
    run_ffmpeg(
        [
            "-f",
            "lavfi",
            "-i",
            f"anullsrc=channel_layout=stereo:sample_rate=44100:duration={duration_sec}",
            "-q:a",
            "9",
            "-acodec",
            "libmp3lame",
            str(voiceover_path),
        ]
    )
    return voiceover_path, "silent_fallback"


def build_scene_clips(assets: list[Path], structure: dict[str, Any], safe: str, work_dir: Path) -> tuple[list[Path], int]:
    log_stage("SCENE_CLIPS")
    clips: list[Path] = []
    seconds_per_scene = int((os.getenv("REEL_SCENE_SECONDS", "4").strip() or "4"))
    for idx, asset in enumerate(assets, start=1):
        clip = work_dir / f"{safe}_clip_{idx:02d}.mp4"
        vf = (
            "scale=1080:1920:force_original_aspect_ratio=increase,"
            "crop=1080:1920,"
            "format=yuv420p"
        )
        run_ffmpeg(
            [
                "-stream_loop",
                "-1",
                "-t",
                str(seconds_per_scene),
                "-i",
                str(asset),
                "-vf",
                vf,
                "-r",
                "30",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                str(clip),
            ]
        )
        clips.append(clip)
    return clips, seconds_per_scene * len(clips)


def concat_clips(clips: list[Path], safe: str, work_dir: Path) -> Path:
    log_stage("CONCAT")
    concat_file = work_dir / f"{safe}_concat.txt"
    concat_file.write_text("\n".join(f"file '{clip.as_posix()}'" for clip in clips), encoding="utf-8")
    scenes_out = work_dir / f"{safe}_scenes.mp4"
    run_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(concat_file), "-c:v", "libx264", "-pix_fmt", "yuv420p", str(scenes_out)])
    return scenes_out


def build_music(duration_sec: int, safe: str, work_dir: Path) -> tuple[Path, str]:
    log_stage("MUSIC")
    music_path = work_dir / f"{safe}_music.mp3"
    run_ffmpeg(
        [
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=196:sample_rate=44100:duration={duration_sec}",
            "-filter:a",
            "volume=0.02",
            "-q:a",
            "9",
            "-acodec",
            "libmp3lame",
            str(music_path),
        ]
    )
    return music_path, "generated_background"


def assemble_final_video(scenes: Path, voiceover: Path, music: Path, output_mp4: Path) -> None:
    log_stage("ASSEMBLE_VIDEO")
    run_ffmpeg(
        [
            "-i",
            str(scenes),
            "-i",
            str(voiceover),
            "-i",
            str(music),
            "-filter_complex",
            "[1:a]volume=1.0[a1];[2:a]volume=0.25[a2];[a1][a2]amix=inputs=2:duration=longest[a]",
            "-map",
            "0:v",
            "-map",
            "[a]",
            "-r",
            "30",
            "-s",
            "1080x1920",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            str(output_mp4),
        ]
    )


def run_pipeline(title: str, video_source: str = "hybrid", ges_from: str = "Milano", ges_to: str = "Buenos Aires") -> Path:
    if not ffmpeg_available():
        raise RuntimeError("FFmpeg is required but was not found in PATH.")

    ensure_dirs()
    safe = safe_title(title)
    reel_dir = OUTPUT_DIR / safe
    work_dir = reel_dir / "_work"
    reel_dir.mkdir(parents=True, exist_ok=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    log_stage("REEL_STRUCTURE")
    prompt_template = read_prompt_template()
    structure = generate_structure_with_openai(title, prompt_template)

    log_stage("SAVE_JSON")
    json_path = reel_dir / f"{safe}_reel.json"
    json_path.write_text(json.dumps(structure, ensure_ascii=False, indent=2), encoding="utf-8")
    auto_ges_from = str(structure.get("event_1_location") or ges_from or "Milano")
    auto_ges_to = str(structure.get("event_2_location") or ges_to or "Buenos Aires")
    ges_plan_path = reel_dir / f"{safe}_google_earth_plan.json"
    ges_plan = {
        "style": "fly_to_and_orbit",
        "from": auto_ges_from,
        "to": auto_ges_to,
        "note": "Use a point-to-point flight with a subtle orbit around destination for contextual linkage.",
    }
    ges_plan_path.write_text(json.dumps(ges_plan, ensure_ascii=False, indent=2), encoding="utf-8")
    reel_facts = {
        "event_1": structure.get("event_1"),
        "event_1_year": structure.get("event_1_year"),
        "event_1_location": structure.get("event_1_location"),
        "event_2": structure.get("event_2"),
        "event_2_year": structure.get("event_2_year"),
        "event_2_location": structure.get("event_2_location"),
        "overlap_period": structure.get("overlap_period"),
        "hook_question_en": structure.get("hook_question_en"),
        "reel_logic": [
            "1) Hook on Event 1",
            f"2) Connection via Google Earth Studio: {auto_ges_from} -> {auto_ges_to}",
            "3) Strong visual for Event 2",
            "4) CTA",
        ],
    }
    print("REEL_FACTS:" + json.dumps(reel_facts, ensure_ascii=False), flush=True)

    assets, materials = create_scene_video_assets(title, structure, safe, work_dir, video_source, auto_ges_from, auto_ges_to)
    voiceover, voiceover_type = create_voiceover(structure, safe, work_dir)
    clips, duration_sec = build_scene_clips(assets, structure, safe, work_dir)
    scenes = concat_clips(clips, safe, work_dir)
    music, music_type = build_music(duration_sec, safe, work_dir)

    output_mp4 = reel_dir / f"{safe}_reel.mp4"
    assemble_final_video(scenes, voiceover, music, output_mp4)
    material_summary = {
        "materials": materials,
        "voiceover_type": voiceover_type,
        "music_type": music_type,
    }
    print("REEL_MATERIALS:" + json.dumps(material_summary, ensure_ascii=False), flush=True)
    log_stage("DONE")
    return output_mp4


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("title")
    parser.add_argument("--video-source", choices=["hybrid", "sora", "google_earth"], default=os.getenv("REEL_VIDEO_SOURCE", "hybrid"))
    parser.add_argument("--ges-from", default=os.getenv("REEL_GES_FROM", "Milano"))
    parser.add_argument("--ges-to", default=os.getenv("REEL_GES_TO", "Buenos Aires"))
    args = parser.parse_args()

    load_env_file(BASE_DIR / ".env.local")
    load_env_file(BASE_DIR.parent / ".env.local")

    title = args.title.strip()
    if not title:
        print("Title is required.", file=sys.stderr)
        return 2

    try:
        final_path = run_pipeline(
            title=title,
            video_source=args.video_source,
            ges_from=args.ges_from.strip() or "Milano",
            ges_to=args.ges_to.strip() or "Buenos Aires",
        )
        print(f"FINAL_VIDEO:{final_path.as_posix()}", flush=True)
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
