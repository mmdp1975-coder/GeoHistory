import os
import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise SystemExit("DATABASE_URL non presente nelle variabili d'ambiente")

with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              SUM(CASE WHEN year_from IS NULL THEN 1 ELSE 0 END) AS null_year_from,
              SUM(CASE WHEN year_to IS NULL THEN 1 ELSE 0 END)   AS null_year_to
            FROM events_list
            """
        )
        null_counts = cur.fetchone()

        cur.execute(
            """
            SELECT COUNT(*) AS to_lt_from
            FROM events_list
            WHERE year_from IS NOT NULL
              AND year_to   IS NOT NULL
              AND year_to < year_from
            """
        )
        need_swap = cur.fetchone()["to_lt_from"]

        swapped_ids = []
        if need_swap:
            cur.execute(
                """
                UPDATE events_list
                   SET year_from = year_to,
                       year_to   = year_from
                 WHERE year_from IS NOT NULL
                   AND year_to   IS NOT NULL
                   AND year_to < year_from
                RETURNING id
                """
            )
            swapped_ids = [row["id"] for row in cur.fetchall()]
            conn.commit()

        cur.execute(
            """
            SELECT COUNT(*) AS missing_era
            FROM events_list
            WHERE era IS NULL OR trim(era) = ''
            """
        )
        missing_era = cur.fetchone()["missing_era"]

print({
    "null_year_from": null_counts["null_year_from"],
    "null_year_to": null_counts["null_year_to"],
    "swapped_count": len(swapped_ids),
    "missing_era": missing_era
})
if swapped_ids:
    print("Swapped IDs (first 20):", swapped_ids[:20])
