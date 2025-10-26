"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Props = {
  journeyId?: string;
  group_event_id?: string; // compat
  size?: number;
  readOnly?: boolean;
};

export default function RatingStars(props: Props) {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const id = props.journeyId ?? props.group_event_id ?? null;
  const size = props.size ?? 18;
  const readOnly = !!props.readOnly;

  const [avg, setAvg] = useState<number | null>(null);
  const [cnt, setCnt] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  async function refreshStats() {
    if (!id) return;
    const { data } = await supabase
      .from("v_group_event_rating_stats")
      .select("avg_rating, ratings_count")
      .eq("group_event_id", id)
      .maybeSingle();

    setAvg(data?.avg_rating != null ? Number(data.avg_rating) : null);
    setCnt(data?.ratings_count != null ? Number(data.ratings_count) : 0);
  }

  useEffect(() => {
    refreshStats();
  }, [id]); // eslint-disable-line

  async function rate(n: number) {
    if (readOnly) return;
    if (!id) return;

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user?.id) {
      alert("Accedi per votare");
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      await supabase
        .from("v_rate_journey_upsert")
        .insert({ group_event_id: id, rating: n } as any);
      await refreshStats();
    } finally {
      setSaving(false);
    }
  }

  const stars = useMemo(() => {
    const val = avg ?? 0;
    const full = Math.floor(val);
    return { full };
  }, [avg]);

  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => rate(n)}
            title={`Rate ${n}`}
            disabled={saving || readOnly}
            className="p-0.5"
            aria-label={`Rate ${n}`}
          >
            <svg
              width={size}
              height={size}
              viewBox="0 0 24 24"
              fill={n <= stars.full ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21 12 17.27z" />
            </svg>
          </button>
        ))}
      </div>
      <div className="text-sm text-slate-600">
        {avg != null ? avg.toFixed(1) : "-"}{cnt > 0 ? ` (${cnt})` : ""}
      </div>
    </div>
  );
}
