'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

type Props = {
  groupEventId: string;
  size?: number; // dimensione icona stella in px
  className?: string;
};

export default function RatingSummary({ groupEventId, size = 14, className = "" }: Props) {
  const supabase = createClientComponentClient();
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: stats } = await supabase
          .from('v_group_event_rating_stats')
          .select('*')
          .eq('group_event_id', groupEventId)
          .maybeSingle();

        if (!mounted) return;
        if (stats) {
          setAvg(Number(stats.avg_rating));
          setCount(Number(stats.ratings_count));
        } else {
          setAvg(null);
          setCount(0);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [groupEventId, supabase]);

  const Star = () => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="opacity-80"
    >
      <path d="M12 17.27l6.18 3.73-1.64-7.03L21.5 9.24l-7.19-.62L12 2 9.69 8.62 2.5 9.24l4.96 4.73L5.82 21z"/>
    </svg>
  );

  if (loading) return <span className={`text-xs text-neutral-400 ${className}`}>—</span>;

  if (!count || avg == null) {
    return <span className={`text-xs text-neutral-400 ${className}`}>No ratings</span>;
  }

  return (
    <span className={`inline-flex items-center gap-1 text-xs text-neutral-700 ${className}`} title={`${avg.toFixed(2)} • ${count} votes`}>
      <Star />
      <span className="tabular-nums">{avg.toFixed(2)}</span>
      <span>•</span>
      <span className="tabular-nums">{count}</span>
    </span>
  );
}
