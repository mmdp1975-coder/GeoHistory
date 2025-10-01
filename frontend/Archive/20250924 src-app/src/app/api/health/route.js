import { NextResponse } from "next/server";

function envTrim(n){ const v=process.env[n]; return typeof v==="string"?v.trim():""; }
function hasEnv(){ return !!(envTrim("NEXT_PUBLIC_SUPABASE_URL") && envTrim("NEXT_PUBLIC_SUPABASE_ANON_KEY")); }
function supaHeaders(){
  const key = envTrim("NEXT_PUBLIC_SUPABASE_ANON_KEY") || envTrim("SUPABASE_ANON_KEY");
  return { apikey:key, Authorization:`Bearer ${key}`, Accept:"application/json", Prefer:"count=exact", Range:"0-999999" };
}

export async function GET() {
  try {
    if (!hasEnv()) return NextResponse.json({ ok:false, reason:"missing env" }, { status:200 });
    const base = envTrim("NEXT_PUBLIC_SUPABASE_URL") || envTrim("SUPABASE_URL");
    const url  = new URL(`${base}/rest/v1/events`);
    url.searchParams.set("select","id,latitude,longitude,year_from,year_to,event_year,exact_date");
    const res = await fetch(url.toString(), { headers: supaHeaders(), cache:"no-store" });
    const rows = res.ok ? await res.json() : [];
    const total = rows.length;
    const withCoords = rows.filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude)).length;
    const minY = rows.reduce((m,r)=>{
      const ys=[r.year_from, r.event_year, (r.exact_date? new Date(r.exact_date).getUTCFullYear():null)]
        .filter(n=>Number.isFinite(n));
      if(!ys.length) return m;
      const v=Math.min(...ys);
      return (m==null||v<m)?v:m;
    }, null);
    const maxY = rows.reduce((m,r)=>{
      const ys=[r.year_to, r.event_year, (r.exact_date? new Date(r.exact_date).getUTCFullYear():null)]
        .filter(n=>Number.isFinite(n));
      const v=ys.length?Math.max(...ys):(Number.isFinite(r.year_from)?r.year_from:null);
      if(v==null) return m;
      return (m==null||v>m)?v:m;
    }, null);
    return NextResponse.json({ ok:true, total, withCoords, minY, maxY }, { status:200 });
  } catch(e){
    return NextResponse.json({ ok:false, error:String(e) }, { status:200 });
  }
}
