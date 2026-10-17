const P = {
  thumbUp: <path d="M7 11v9H4v-9zM7 11l4-8c1.6 0 2.6 1.1 2.3 2.7L12.6 9H19a2 2 0 011.9 2.6l-2 7A2 2 0 0117 20H7" />,
  thumbDown: <path d="M7 13V4H4v9zM7 13l4 8c1.6 0 2.6-1.1 2.3-2.7L12.6 15H19a2 2 0 001.9-2.6l-2-7A2 2 0 0017 4H7" />,
  share: <path d="M12 15V4m0 0L8 8m4-4l4 4M5 12v6a2 2 0 002 2h10a2 2 0 002-2v-6" />,
  dots: <><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></>,
  sidebar: <path d="M4 5h16v14H4zM9 5v14" />,
  sort: <path d="M4 7h9M4 12h6M4 17h3M17 6v12m0 0l-3-3m3 3l3-3" />,
  logo: <path d="M4 15c4-8 8 4 16-5M4 20c4-8 8 4 16-5" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4" /></>,
  folder: <path d="M3 7h6l2 2h10v10H3z" />,
  book: <path d="M4 5h7v14H4zM13 5h7v14h-7z" />,
  pencil: <path d="M4 20l4-1 11-11-3-3L5 16z" />,
  img: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="M5 18l5-5 4 4 2-2 3 3" /></>,
  vid: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></>,
  mus: <><path d="M9 18V6l10-2v12" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="16" r="2" /></>,
  wave: <path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 11v2" />,
  sparkle: <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />,
  chevL: <path d="M15 5l-7 7 7 7" />,
  chevR: <path d="M9 5l7 7-7 7" />,
  chevD: <path d="M6 9l6 6 6-6" />,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  ratio: <rect x="6" y="4" width="12" height="16" rx="2" />,
  screen: <rect x="3" y="6" width="18" height="12" rx="2" />,
  bitrate: <rect x="3" y="6" width="14" height="12" rx="2" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  settings: <><path d="M4 8h10M18 8h2M4 16h2M10 16h10" /><circle cx="16" cy="8" r="2" /><circle cx="8" cy="16" r="2" /></>,
  filter: <path d="M4 7h16M7 12h10M10 17h4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  at: <><circle cx="12" cy="12" r="3.5" /><path d="M15.5 12v1.5a2.5 2.5 0 005 0V12a8.5 8.5 0 10-3.5 6.9" /></>,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  wand: <><path d="M5 19L16 8l2 2L7 21z" /><path d="M16 3v3M14.5 4.5h3M20 9v2M19 10h2" /></>,
  extend: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" /></>,
  crop: <path d="M7 3v14h14M3 7h14v14" />,
  upscale: <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />,
  cutout: <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /></>,
  hdr: <><ellipse cx="12" cy="12" rx="9" ry="5.5" /><circle cx="12" cy="12" r="2.5" /></>,
  gauge: <><circle cx="12" cy="12" r="8" /><path d="M12 12l4-3" /></>,
  layers: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" />,
  motion: <path d="M5 12a7 7 0 0114 0M5 12a7 7 0 0014 0M9 12h6" />,
  bars: <path d="M5 19V9M10 19V5M15 19v-7M20 19V8" />,
  burst: <path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.5 5.5l4 4M14.5 14.5l4 4M18.5 5.5l-4 4M9.5 14.5l-4 4" />,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M3 15h18M8 4v16M16 4v16" /></>,
  app: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8 14c2-5 3 2 8-3" /></>,
  diamond: <path d="M12 3l9 9-9 9-9-9z" />,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-4 3-6 7-6s7 2 7 6" /></>,
  shapes: <><circle cx="8" cy="8" r="3.5" /><rect x="12" y="12" width="8" height="8" rx="1.5" /></>,
  palette: <><path d="M12 4a8 8 0 100 16c1.5 0 2-1 1.5-2s0-2 1.5-2h2a3 3 0 003-3c0-4-4-9-8-9z" /><circle cx="8" cy="11" r="1" /><circle cx="12" cy="8" r="1" /><circle cx="16" cy="9" r="1" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01" /></>,
  cube: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  revert: <path d="M4 5v5h5M4.5 10A8 8 0 1112 20" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  send: <path d="M7 17L17 7M9 7h8v8" />,
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  upload: <path d="M12 16V5M7 9l5-5 5 5M5 20h14" />,
  star: <path d="M12 3l2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8z" />,
  chain: <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />,
  play: <path d="M8 5l11 7-11 7z" />,
  copy: <><rect x="8" y="8" width="11" height="12" rx="2" /><path d="M5 16V6a2 2 0 012-2h9" /></>,
  pause: <path d="M8 5v14M16 5v14" />,
  mute: <path d="M4 10v4h4l5 4V6L8 10zM17 9l5 6M22 9l-5 6" />,
  sound: <path d="M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" />,
}

export default function Icon({ name, size = 18, color = 'currentColor', fill = 'none' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  )
}

export const Heart = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
    <path d="M12 21s-8-5.5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.5-8 11-8 11z" />
  </svg>
)

export const PlayBadge = () => (
  <svg className="pl2" width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="rgba(0,0,0,.45)" />
    <path d="M10 8l6 4-6 4z" fill="#fff" />
  </svg>
)
