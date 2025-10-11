'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

type Props = {
  groupEventId: string;
  size?: number;
  readonlyIfLoggedOut?: boolean;
  onChange?: (rating: number, avg: number, count: number) => void;
};

export default function RatingStars({
  groupEventId,
  size = 22,
  readonlyIfLoggedOut = true,
  onChange,
}: Props) {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!mounted) return;
        setUserId(user?.id ?? null);

        const { data: stats } = await supabase
          .from('group_event_rating_stats')
          .select('*')
          .eq('group_event_id', groupEventId)
          .maybeSingle();

        if (stats) {
          setAvg(Number(stats.avg_rating));
          setCount(Number(stats.ratings_count));
        } else {
          setAvg(null);
          setCount(0);
        }

        if (user?.id) {
          const { data: mine } = await supabase
            .from('group_event_ratings')
            .select('rating')
            .eq('group_event_id', groupEventId)
            .eq('user_id', user.id)
            .maybeSingle();
          setUserRating(mine?.rating ?? null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [groupEventId, supabase]);

  const readonly = readonlyIfLoggedOut && !userId;

  const label = useMemo(() => {
    const a = avg ?? 0;
    const c = count ?? 0;
    return c ? `${a.toFixed(2)} • ${c} vote${c === 1 ? '' : 's'}` : 'No ratings yet';
  }, [avg, count]);

  async function setRating(value: number) {
    if (readonly || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('group_event_ratings')
        .upsert(
          { group_event_id: groupEventId, user_id: userId, rating: value },
          { onConflict: 'group_event_id,user_id' }
        );
      if (error) throw error;

      const [{ data: stats }, { data: mine }] = await Promise.all([
        supabase.from('group_event_rating_stats').select('*').eq('group_event_id', groupEventId).maybeSingle(),
        supabase.from('group_event_ratings').select('rating').eq('group_event_id', groupEventId).eq('user_id', userId).maybeSingle(),
      ]);

      setUserRating(mine?.rating ?? value);
      setAvg(stats ? Number(stats.avg_rating) : value);
      setCount(stats ? Number(stats.ratings_count) : 1);
      onChange?.(mine?.rating ?? value, stats ? Number(stats.avg_rating) : value, stats ? Number(stats.ratings_count) : 1);
    } catch (e: any) {
      console.error(e);
      alert(e.message ?? 'Rating failed');
    } finally {
      setBusy(false);
    }
  }

  const Star = ({ filled }: { filled: boolean }) => (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="1.5"
      className={`transition-transform ${busy ? 'opacity-60' : ''}`}
      style={{ cursor: readonly ? 'default' : 'pointer' }}
    >
      <path d="M12 17.27l6.18 3.73-1.64-7.03L21.5 9.24l-7.19-.62L12 2 9.69 8.62 2.5 9.24l4.96 4.73L5.82 21z"/>
    </svg>
  );

  if (loading) return <div className="text-xs opacity-70">Loading rating…</div>;

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <div className="flex items-center gap-1" aria-label="rating stars">
        {Array.from({ length: 5 }).map((_, i) => {
          const val = i + 1;
          const active = hover ? val <= hover : val <= (userRating ?? 0);
          return (
            <span
              key={val}
              onMouseEnter={() => !readonly && setHover(val)}
              onMouseLeave={() => !readonly && setHover(null)}
              onClick={() => setRating(val)}
              role={readonly ? undefined : 'button'}
              aria-label={`${val} star`}
              title={readonly && !userId ? 'Sign in to rate' : `${val} star`}
            >
              <Star filled={active}/>
            </span>
          );
        })}
      </div>
      <div className="text-xs opacity-70">{label}</div>
    </div>
  );
}
