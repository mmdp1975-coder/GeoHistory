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
LAST_STYLE_RULES: str | None = None


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

def run_prompt_1(title: str, event_guideline: str | None):
    p1 = read_text(PROMPT_1_PATH)
    log_stage("PROMPT_1_START")
    prompt1 = p1.replace("<INSERISCI TITOLO DEL JOURNEY>", title)
    prompt1 = prompt1.replace(
        "<INSERISCI REGOLA EVENTI DALLA UI>",
        event_guideline.strip() if event_guideline else "",
    )
    json_a = extract_json(responses_text(prompt1))
    try:
        PROMPT_1_OUT_PATH.write_text(json.dumps(json_a, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass
    log_stage("PROMPT_1_DONE")
    return json_a

def build_style_rules(audience: str, styles: str, detail_level: str) -> str:
    audience_rules = {
        "Giovani": (
            "TARGET: Lessico semplice ma non infantile, ritmo vivo, frasi chiare ma non spezzate. "
            "Spiega i nessi in modo concreto e visivo, evitando astrazioni dense e tono scolastico."
        ),
        "Studenti": (
            "TARGET: Registro chiaro e maturo. Inserisci contesto, causa ed effetto con linguaggio ordinato ma scorrevole, "
            "senza semplificare troppo e senza tecnicismi gratuiti."
        ),
        "Esperti": (
            "TARGET: Registro preciso e maturo. Più densità storica, nessi causali e lessico disciplinare controllato, "
            "senza teatralità e senza formule divulgative banali."
        ),
    }
    detail_rules = {
        "breve": (
            "DETTAGLIO EVENTI: Testo compatto ma non secco. Concentrati su nucleo dell'evento, passaggio storico decisivo "
            "e una conseguenza immediata, privilegiando fluidità e chiarezza. DETTAGLIO JOURNEY: Sintesi compatta ma narrativa."
        ),
        "medio": (
            "DETTAGLIO EVENTI: Sviluppo pieno e sostanzioso. Inserisci contesto storico, snodo principale, attori coinvolti, "
            "conseguenze immediate e continuità con il processo storico, con periodi variati e non meccanici. "
            "La descrizione deve risultare chiaramente sviluppata, non sintetica. "
            "DETTAGLIO JOURNEY: Sviluppo pieno con contesto, svolta, progressione e chiusura."
        ),
        "approfondito": (
            "DETTAGLIO EVENTI: Sviluppo molto ricco e disteso. Inserisci contesto storico ampio, dinamica interna dell'evento, "
            "attori e interessi in gioco, posta in gioco, conseguenze immediate, ricadute più larghe e una sfumatura interpretativa. "
            "Quando pertinenti, inserisci anche un aneddoto breve, una situazione concreta, un dettaglio umano o un episodio significativo "
            "storicamente plausibile e coerente con l'evento, senza inventare fatti. La descrizione deve essere ampia, coinvolgente e ben "
            "articolata. Deve essere visibilmente più estesa del livello medio, senza diventare prolisso o accademico. "
            "DETTAGLIO JOURNEY: Visione d'insieme ampia con passaggi, implicazioni e coerenza narrativa forte."
        ),
    }
    style_signals = {
        "Documentaristico": (
            "STILE DOMINANTE: Documentaristico. Tono autorevole e chiaro, ordine temporale leggibile, "
            "transizioni naturali e lessico concreto."
        ),
        "Narrativo": (
            "STILE DOMINANTE: Narrativo. Apertura contestuale, ritmo fluido, immagini storiche concrete e passaggi morbidi "
            "tra un evento e l'altro senza romanzare."
        ),
        "Analitico": (
            "STILE DOMINANTE: Analitico. Metti in evidenza cause, snodi, conseguenze e trasformazioni, "
            "con scrittura compatta e non accademicamente pesante."
        ),
    }
    styles_list = [s.strip() for s in styles.split(",") if s.strip()]
    lines: list[str] = []
    if audience in audience_rules:
        lines.append(audience_rules[audience])
    lines.append(detail_rules.get(detail_level, detail_rules["medio"]))
    dominant = styles_list[0] if styles_list else ""
    if dominant and dominant in style_signals:
        lines.append(style_signals[dominant])
    lines.append(
        "FLUIDITÀ: Scrivi testi continui, leggibili ad alta voce e con ritmo narrativo. Alterna frasi medie e più ampie; "
        "evita frasi spezzate, formule scolastiche ripetute, elenchi mascherati e chiusure meccaniche."
    )
    lines.append(
        "COINVOLGIMENTO: Apri spesso con un contesto o una tensione storica concreta, non con formule piatte. "
        "Fai percepire ambiente, posta in gioco, attori e conseguenze senza trasformare il testo in romanzo."
    )
    lines.append(
        "DIVIETI: Non usare metatesto come 'questo evento si collega al precedente', 'nel prossimo evento', "
        "'collegamento con l'evento successivo', 'in conclusione di questo paragrafo'."
    )
    lines.append(
        "COLLEGAMENTI: Il nesso tra eventi deve emergere dal contenuto storico, per esempio attraverso continuità politica, "
        "reazioni, conseguenze, crisi o riforme; non dichiararlo come etichetta."
    )
    lines.append(
        "STILE FRASE: Evita sequenze rigide del tipo causa -> azione -> conseguenza scritte come tre frasi scolastiche. "
        "Integra questi elementi in una narrazione naturale."
    )
    lines.append(
        "DESCRIZIONE JOURNEY: Deve introdurre il filo storico comune, spiegare perché questi eventi stanno insieme "
        "e invitare alla lettura con tono scorrevole."
    )
    lines.append(
        "CHECK FINALE: Dopo aver scritto tutte le descrizioni, rileggi l'intero journey come sequenza unica e verifica "
        "progressione narrativa, varietà tra gli eventi, coerenza del filo conduttore, assenza di formule meccaniche "
        "e adeguatezza al livello di dettaglio scelto. Se necessario, riscrivi prima di restituire il JSON."
    )
    return "\n".join(lines)


def run_prompt_2(audience: str, styles: str, detail_level: str, json_a: dict):
    p2 = read_text(PROMPT_2_PATH)
    log_stage("PROMPT_2_START")
    style_rules = build_style_rules(audience, styles, detail_level)
    global LAST_STYLE_RULES
    LAST_STYLE_RULES = style_rules
    prompt2 = (
        p2.replace("<INSERISCI TARGET DALLA UI>", audience)
          .replace("<INSERISCI STILI DALLA UI>", styles)
          .replace("<INSERISCI LIVELLO DETTAGLIO DALLA UI>", detail_level)
          .replace("<REGOLE_STILISTICHE_DA_UI>", style_rules)
        + "\n\nJSON_INPUT_PROMPT_1=\n"
        + json.dumps(json_a, ensure_ascii=False)
    )
    raw = responses_text(prompt2)
    if raw.strip().startswith("TASK FAILED"):
        print("TASK_FAILED_OUTPUT:" + json.dumps({"text": raw[:2000]}, ensure_ascii=False), flush=True)
        raise RuntimeError(f"{raw.strip()} returned by model.")
    json_b = extract_json(raw)
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

def run_pipeline(title: str, audience: str, styles: str, detail_level: str, event_guideline: str | None):
    json_a = run_prompt_1(title, event_guideline)
    json_b = run_prompt_2(audience, styles, detail_level, json_a)
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
    parser.add_argument("--styles", required=True)
    parser.add_argument("--detail-level", required=True)
    parser.add_argument("--event-guideline")
    parser.add_argument("--status-file")
    parser.add_argument("--step", choices=["1", "2", "3"])
    args = parser.parse_args()

    global STATUS_FILE
    if args.status_file:
        STATUS_FILE = Path(args.status_file)

    try:
        if args.step == "1":
            payload = run_prompt_1(args.title, args.event_guideline)
        elif args.step == "2":
            if not PROMPT_1_OUT_PATH.exists():
                raise RuntimeError("Missing OUTPUT_PROMPT_1.json")
            json_a = json.loads(PROMPT_1_OUT_PATH.read_text(encoding="utf-8"))
            payload = run_prompt_2(args.audience, args.styles, args.detail_level, json_a)
        elif args.step == "3":
            if not PROMPT_2_OUT_PATH.exists():
                raise RuntimeError("Missing OUTPUT_PROMPT_2.json")
            json_b = json.loads(PROMPT_2_OUT_PATH.read_text(encoding="utf-8"))
            payload = run_prompt_3(json_b)
        else:
            payload = run_pipeline(args.title, args.audience, args.styles, args.detail_level, args.event_guideline)
        write_status({"status": "done", "stage": "done", "updated_at": utc_timestamp()})
        if LAST_STYLE_RULES:
            print("STYLE_RULES:" + json.dumps({"rules": LAST_STYLE_RULES}, ensure_ascii=False))
        print("JSON_RESULT:" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    except Exception as exc:
        write_status({"status": "error", "stage": "error", "error": str(exc), "updated_at": utc_timestamp()})
        raise

if __name__ == "__main__":
    main()
