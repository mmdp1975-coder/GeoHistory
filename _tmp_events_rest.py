import os
import math
import requests

BASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_ROLE = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not BASE_URL or not SERVICE_ROLE:
    raise SystemExit("Servono NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY")

REST_URL = f"{BASE_URL}/rest/v1/events_list"
headers = {
    "apikey": SERVICE_ROLE,
    "Authorization": f"Bearer {SERVICE_ROLE}",
    "Content-Type": "application/json",
    "Prefer": "count=exact"
}

rows = []
offset = 0
limit = 1000
while True:
    range_header = {"Range": f"{offset}-{offset + limit - 1}"}
    resp = requests.get(
        REST_URL,
        params={"select": "id,year_from,year_to,era"},
        headers={**headers, **range_header},
        timeout=30,
    )
    resp.raise_for_status()
    batch = resp.json()
    rows.extend(batch)
    content_range = resp.headers.get("Content-Range", "0-0/0")
    total = int(content_range.split("/")[-1])
    offset += limit
    if offset >= total:
        break

null_year_from = sum(1 for r in rows if r["year_from"] is None)
null_year_to = sum(1 for r in rows if r["year_to"] is None)
missing_era = sum(1 for r in rows if r["era"] is None or str(r["era"]).strip() == "")

swap_candidates = [r for r in rows if r["year_from"] is not None and r["year_to"] is not None and r["year_to"] < r["year_from"]]

for r in swap_candidates:
    payload = {"year_from": r["year_to"], "year_to": r["year_from"]}
    patch_headers = headers.copy()
    patch_headers["Prefer"] = "return=minimal"
    resp = requests.patch(
        REST_URL,
        params={"id": f"eq.{r['id']}"},
        json=payload,
        headers=patch_headers,
        timeout=15,
    )
    resp.raise_for_status()

print({
    "null_year_from": null_year_from,
    "null_year_to": null_year_to,
    "swapped_count": len(swap_candidates),
    "missing_era": missing_era,
})
