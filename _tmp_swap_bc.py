import os
import requests

BASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
REST_URL = f"{BASE_URL}/rest/v1/events_list"
headers = {
    "apikey": SERVICE_ROLE,
    "Authorization": f"Bearer {SERVICE_ROLE}",
    "Content-Type": "application/json",
    "Prefer": "count=exact"
}

rows = []
range_start = 0
limit = 1000
while True:
    range_header = {"Range": f"{range_start}-{range_start + limit - 1}"}
    resp = requests.get(
        REST_URL,
        params={"select": "id,year_from,year_to,era"},
        headers={**headers, **range_header},
        timeout=30,
    )
    resp.raise_for_status()
    batch = resp.json()
    rows.extend(batch)
    total = int(resp.headers.get("Content-Range", "0-0/0").split("/")[-1])
    range_start += limit
    if range_start >= total:
        break

def is_bc(era: str | None) -> bool:
    if not era:
        return False
    e = era.strip().upper()
    return e in {"BC", "BCE"}

swap_targets = [r for r in rows if is_bc(r.get("era")) and r["year_from"] is not None and r["year_to"] is not None and r["year_from"] < r["year_to"]]

if swap_targets:
    patch_headers = headers.copy()
    patch_headers["Prefer"] = "return=minimal"
    for r in swap_targets:
        payload = {"year_from": r["year_to"], "year_to": r["year_from"]}
        resp = requests.patch(
            REST_URL,
            params={"id": f"eq.{r['id']}"},
            json=payload,
            headers=patch_headers,
            timeout=15,
        )
        resp.raise_for_status()

print(f"Swapped BC pairs: {len(swap_targets)}")
