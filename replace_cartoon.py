import re
from pathlib import Path
path = Path('frontend/app/module/group_event/page_inner.tsx')
text = path.read_text(encoding='utf-8')
pattern = r'function CartoonGuy\([\s\S]*?\}\r?\n\r?\n\r?\n\r?\n'
match = re.search(pattern, text)
if not match:
    raise SystemExit('block not found')
replacement = '''function buildCartoonGuyMarkup(animated: boolean): string {
  const rootGroupClass = animated ? "walker-modern walker-modern--animated" : "walker-modern";
  return `
<svg viewBox="0 0 160 180" class="walker-modern-svg" role="img" aria-hidden="true">
  <defs>
    <linearGradient id="walker-shadow" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="rgba(15,23,42,0.25)" />
      <stop offset="100%" stop-color="rgba(15,23,42,0.05)" />
    </linearGradient>
    <linearGradient id="walker-sweater" x1="0" x2="0.9" y1="0" y2="1">
      <stop offset="0%" stop-color="#c4965c" />
      <stop offset="100%" stop-color="#8d6237" />
    </linearGradient>
    <linearGradient id="walker-pants" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#e5d8c9" />
      <stop offset="100%" stop-color="#bfae98" />
    </linearGradient>
    <linearGradient id="walker-hair" x1="0.1" x2="0.9" y1="0" y2="0.5">
      <stop offset="0%" stop-color="#2c2018" />
      <stop offset="100%" stop-color="#120c09" />
    </linearGradient>
    <linearGradient id="walker-shoe" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#211f1d" />
      <stop offset="100%" stop-color="#0f0f0f" />
    </linearGradient>
    <radialGradient id="walker-skin" cx="0.5" cy="0.3" r="0.7">
      <stop offset="0%" stop-color="#f5d4bc" />
      <stop offset="100%" stop-color="#dfb091" />
    </radialGradient>
    <linearGradient id="walker-shadow-leg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0.15)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0)" />
    </linearGradient>
  </defs>
  <style>
    .walker-modern-svg { width: 100%; height: 100%; display: block; }
    .walker-modern { transform-box: fill-box; }
    .walker-modern__shadow { opacity: 0.9; }
    .walker-modern--animated { animation: walker-bob 1s ease-in-out infinite alternate; }
    .walker-modern__leg,
    .walker-modern__arm,
    .walker-modern__body,
    .walker-modern__head { transform-box: fill-box; }
    .walker-modern--animated .walker-modern__leg--back { animation: walker-leg-back 1s ease-in-out infinite alternate; }
    .walker-modern--animated .walker-modern__leg--front { animation: walker-leg-front 1s ease-in-out infinite alternate; }
    .walker-modern--animated .walker-modern__arm--back { animation: walker-arm-back 1s ease-in-out infinite alternate; }
    .walker-modern--animated .walker-modern__arm--front { animation: walker-arm-front 1s ease-in-out infinite alternate; }
    .walker-modern--animated .walker-modern__body { animation: walker-body 1s ease-in-out infinite alternate; }
    @keyframes walker-bob { from { transform: translateY(0px); } to { transform: translateY(-3px); } }
    @keyframes walker-leg-back { from { transform: rotate(-12deg); } to { transform: rotate(10deg); } }
    @keyframes walker-leg-front { from { transform: rotate(14deg); } to { transform: rotate(-12deg); } }
    @keyframes walker-arm-back { from { transform: rotate(16deg); } to { transform: rotate(-16deg); } }
    @keyframes walker-arm-front { from { transform: rotate(-18deg); } to { transform: rotate(18deg); } }
    @keyframes walker-body { from { transform: translateY(-1.5px); } to { transform: translateY(1.5px); } }
  </style>
  <g class="${rootGroupClass}">
    <ellipse cx="82" cy="152" rx="32" ry="10" fill="url(#walker-shadow)" class="walker-modern__shadow" />
    <g class="walker-modern__leg walker-modern__leg--back" style="transform-origin: 60px 118px;">
      <path d="M62 94c-14 13-26 40-20 50s22 8 30 0l12-18-22-32Z" fill="url(#walker-pants)" />
      <path d="M66 140c-4 6-2 12 5 14s18 0 23-3l-5-12" fill="url(#walker-shoe)" />
      <path d="M69 114c-6 8-8 16-4 22" stroke="url(#walker-shadow-leg)" stroke-width="3" stroke-linecap="round" />
    </g>
    <g class="walker-modern__leg walker-modern__leg--front" style="transform-origin: 104px 114px;">
      <path d="M106 92c18 12 32 36 30 46s-20 12-34 6l-16-16 20-36Z" fill="url(#walker-pants)" />
      <path d="M114 140c6 5 14 8 12 14s-18 8-27 3l-6-10" fill="url(#walker-shoe)" />
      <path d="M110 114c6 8 10 16 8 22" stroke="url(#walker-shadow-leg)" stroke-width="3" stroke-linecap="round" />
    </g>
    <g class="walker-modern__body" style="transform-origin: 88px 82px;">
      <path d="M70 60c0-16 12-30 26-30s26 14 26 30v34c0 16-12 30-26 30s-26-14-26-30V60Z" fill="url(#walker-sweater)" />
      <path d="M78 58c4 6 9 10 14 10s10-4 14-10l-3-22H81l-3 22Z" fill="#8f633a" opacity="0.45" />
      <path d="M88 58h16l4 34c0 8-6 14-12 14s-12-6-12-14l4-34Z" fill="rgba(255,255,255,0.08)" />
      <g class="walker-modern__head" style="transform-origin: 96px 50px;">
        <path d="M92 24c11 0 20 9 20 20s-6 22-20 22-20-11-20-22 9-20 20-20Z" fill="url(#walker-skin)" />
        <path d="M74 42c3-14 12-22 24-22s20 8 23 22l-12 5H86l-12-5Z" fill="url(#walker-hair)" />
        <path d="M88 46c3 1 6 1 8 0" stroke="#2d1f14" stroke-width="2" stroke-linecap="round" />
        <circle cx="90" cy="44" r="2" fill="#1b1b1b" />
        <path d="M100 58c3 2 7 2 10-1" stroke="#c28f5a" stroke-width="2.6" stroke-linecap="round" />
      </g>
    </g>
    <g class="walker-modern__arm walker-modern__arm--back" style="transform-origin: 72px 80px;">
      <path d="M70 66c-10 12-20 34-14 42l13 8 16-24" fill="url(#walker-sweater)" />
      <path d="M74 110c-2 8 2 14 8 16s12-1 14-5l-6-16" fill="url(#walker-skin)" />
    </g>
    <g class="walker-modern__arm walker-modern__arm--front" style="transform-origin: 116px 82px;">
      <path d="M118 68c10 13 18 34 12 42l-14 8-20-22" fill="url(#walker-sweater)" />
      <path d="M118 114c4 8 10 12 16 10s8-6 6-12l-10-12" fill="url(#walker-skin)" />
    </g>
  </g>
</svg>
`.trim();
}

function CartoonGuy({ className = "h-16 w-16", animated = false }: { className?: string; animated?: boolean }): JSX.Element {
  const markup = buildCartoonGuyMarkup(animated);
  return (
    <span
      className={className}
      role="img"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
'''
new_text = text[:match.start()] + replacement + text[match.end():]
path.write_text(new_text, encoding='utf-8')
