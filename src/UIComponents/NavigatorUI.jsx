import React, { useState, useMemo, useCallback, useRef } from 'react';
import { mockResults } from './test_mock_Data';
import ResultsGrid from './ResultsGrid';
import InsightSidebar from './InsightSidebar';
import ErrorPage from './ErrorPage';
import LoadingSkeleton from './LoadingSkeleton';
import FlightChatbot from './FlightChatBot';
import CostCalculator from './CostCalculator';

/* ─── Global styles injected once into <head> ────────────────────────────── */
const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=IBM+Plex+Mono:wght@400;500;700&family=Crimson+Pro:ital,wght@0,300;1,300&display=swap');

  :root {
    --ink:         #07111c;
    --panel:       #0c1929;
    --surface:     #101f30;
    --border:      #1b3149;
    --amber:       #f59e0b;
    --amber-dim:   #6b3f07;
    --electric:    #38bdf8;
    --electric-dim:#0a3550;
    --text-primary:   #dde8f5;
    --text-secondary: #6d8aaa;
    --text-muted:     #33526b;
  }

  html, body, #root { height: 100%; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--ink);
    color: var(--text-primary);
    font-family: 'IBM Plex Mono', monospace;
    -webkit-font-smoothing: antialiased;
  }

  /* Subtle scanline atmosphere */
  .scanlines::after {
    content: '';
    position: fixed; inset: 0; pointer-events: none; z-index: 9999;
    background: repeating-linear-gradient(
      0deg,
      transparent, transparent 2px,
      rgba(0,0,0,0.025) 2px, rgba(0,0,0,0.025) 4px
    );
  }

  /* Runway blink */
  @keyframes runway {
    0%,88%,100% { opacity: 0.12; }
    94%         { opacity: 1; }
  }
  .rdot { animation: runway 3.2s ease-in-out infinite; }
  .rdot:nth-child(2) { animation-delay:.5s }
  .rdot:nth-child(3) { animation-delay:1s }
  .rdot:nth-child(4) { animation-delay:1.5s }
  .rdot:nth-child(5) { animation-delay:2s }

  /* Content reveals */
  @keyframes rise {
    from { opacity:0; transform:translateY(18px); }
    to   { opacity:1; transform:translateY(0); }
  }
  .rise   { animation: rise .45s ease forwards; }
  .rise-2 { animation: rise .45s .12s ease forwards; opacity:0; }
  .rise-3 { animation: rise .45s .24s ease forwards; opacity:0; }

  /* Loading banner slide-in/out */
  @keyframes bannerIn {
    from { transform: translateY(-100%); opacity: 0; }
    to   { transform: translateY(0);     opacity: 1; }
  }
  @keyframes bannerOut {
    from { transform: translateY(0);     opacity: 1; }
    to   { transform: translateY(-100%); opacity: 0; }
  }
  @keyframes progressPulse {
    0%,100% { opacity: 0.5; }
    50%     { opacity: 1;   }
  }
  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position:  400px 0; }
  }

  /* Amber pulse on CTA */
  @keyframes ctapulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,.45); }
    50%     { box-shadow: 0 0 0 10px rgba(245,158,11,0); }
  }
  .cta-pulse { animation: ctapulse 2.2s ease-in-out infinite; }

  /* Input glow on focus */
  .nav-input {
    transition: border-color .2s, box-shadow .2s;
  }
  .nav-input:focus {
    outline: none;
    border-color: var(--electric) !important;
    box-shadow: 0 0 0 1px var(--electric), 0 0 16px rgba(56,189,248,.12);
  }

  /* Gradient rule */
  .glow-rule {
    height: 1px;
    background: linear-gradient(90deg,
      transparent 0%,
      var(--electric-dim) 20%,
      var(--electric) 50%,
      var(--electric-dim) 80%,
      transparent 100%
    );
    opacity: .55;
  }

  /* Scrollbar */
  ::-webkit-scrollbar       { width: 4px; }
  ::-webkit-scrollbar-track { background: var(--ink); }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  /* Date picker dark mode */
  input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(.5); cursor: pointer; }

  /* Select arrow */
  .nav-select { appearance: none; cursor: pointer; }
`;

/* ─── Tiny shared atoms ──────────────────────────────────────────────────── */

const RunwayDots = () => (
  <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
    {[1,2,3,4,5].map(i => (
      <div key={i} className="rdot" style={{
        width:'6px', height:'6px', borderRadius:'50%', background:'var(--amber)',
      }} />
    ))}
  </div>
);

/* ── LoadingBanner ───────────────────────────────────────────────────────────
   Full-width sticky banner shown from the moment the user hits
   "Run Flight Intelligence" until isLoading becomes false.
   Three phases:
     1. Resolving airports  (no scanStatus, no flights yet)
     2. Scanning city pairs  (scanStatus present, flights popping in)
     3. Loading AI insight   (scanStatus null again, flights present)     */

const LoadingBanner = ({ isLoading, scanStatus, lastScan, flightCount, flexDate }) => {
  const [visible, setVisible] = React.useState(false);
  const [exiting, setExiting] = React.useState(false);

  React.useEffect(() => {
    if (isLoading) {
      setExiting(false);
      setVisible(true);
    } else if (visible) {
      // Slide out gracefully then unmount
      setExiting(true);
      const t = setTimeout(() => { setVisible(false); setExiting(false); }, 400);
      return () => clearTimeout(t);
    }
  }, [isLoading]);

  if (!visible) return null;

  // Determine current phase
  // Use live scanStatus if available; fall back to lastScan to bridge
  // the gap between pairs (when scanStatus is momentarily null mid-stream).
  // Only enter 'insight' phase after the 'done' event fires — detected by
  // scanStatus being null AND flightCount > 0 AND lastScan having been set.
  const activeScan = scanStatus || lastScan;
  const phase = !activeScan && flightCount === 0 ? 'airports'
              : scanStatus !== null               ? 'scanning'
              : lastScan && flightCount === 0     ? 'scanning'
              : lastScan && scanStatus === null    ? 'insight'
              : flightCount > 0                   ? 'insight'
              :                                     'airports';

  const phaseConfig = {
    airports: {
      icon:  '🗺',
      label: 'RESOLVING AIRPORTS',
      sub:   'Locating your origin city and all nearby airports via Amadeus...',
      color: 'var(--electric)',
      bg:    'rgba(56,189,248,0.08)',
      border:'rgba(56,189,248,0.25)',
    },
    scanning: {
      icon:  '✈',
      label: `SCANNING ${activeScan?.origin} → ${activeScan?.dest}`,
      sub:   `${activeScan?.origin_name || activeScan?.origin}  →  ${activeScan?.dest_name || activeScan?.dest}  ·  pair ${activeScan?.combo} of ${activeScan?.total}${flightCount > 0 ? `  ·  ${flightCount} flights found so far` : ''}`,
      color: 'var(--amber)',
      bg:    'rgba(245,158,11,0.08)',
      border:'rgba(245,158,11,0.3)',
    },
    insight: {
      icon:  '🤖',
      label: 'GENERATING AI INSIGHT',
      sub:   `Scraping complete — ${flightCount} flights loaded. Gemini is analysing fares, holidays & booking window...`,
      color: '#a78bfa',
      bg:    'rgba(167,139,250,0.08)',
      border:'rgba(167,139,250,0.3)',
    },
  };

  const { icon, label, sub, color, bg, border } = phaseConfig[phase];

  // Progress bar width
  const progressPct = phase === 'airports' ? 8
                    : phase === 'scanning'  ? 8 + ((activeScan?.combo / activeScan?.total) * 72)
                    : 92;

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 200,
      animation: exiting ? 'bannerOut 0.35s ease forwards' : 'bannerIn 0.3s ease forwards',
      background: bg,
      borderBottom: `1px solid ${border}`,
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    }}>
      {/* Main content row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '9px 32px',
        maxWidth: '1600px', margin: '0 auto',
      }}>
        {/* Animated icon */}
        <span style={{
          fontSize: '16px', flexShrink: 0,
          display: 'inline-block',
          animation: phase === 'scanning' ? 'none' : 'progressPulse 1.2s ease-in-out infinite',
          ...(phase === 'scanning' ? { animation: 'ctapulse 0.7s ease-in-out infinite' } : {}),
        }}>{icon}</span>

        {/* Text block */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
            <span style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px',
              fontWeight: 700, letterSpacing: '.18em', color,
              textTransform: 'uppercase',
            }}>{label}</span>
            {flexDate && (
              <span style={{
                fontFamily: "'IBM Plex Mono', monospace", fontSize: '8px',
                letterSpacing: '.12em', padding: '1px 6px', borderRadius: '20px',
                background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
                color: 'var(--amber)',
              }}>±3 DAYS MODE</span>
            )}
          </div>
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
            color: 'var(--text-secondary)', letterSpacing: '.04em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{sub}</div>
        </div>

        {/* Spinner dots */}
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: '5px', height: '5px', borderRadius: '50%', background: color,
              animation: `progressPulse 1s ${i * 0.2}s ease-in-out infinite`,
            }} />
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: '2px', background: 'rgba(255,255,255,0.05)' }}>
        <div style={{
          height: '100%',
          width: `${progressPct}%`,
          background: `linear-gradient(90deg, ${color} 0%, transparent 100%)`,
          transition: 'width 0.6s ease',
          backgroundSize: '400px 100%',
          animation: phase === 'insight' ? 'shimmer 1.5s linear infinite' : 'none',
        }} />
      </div>
    </div>
  );
};

const ScanIndicator = ({ status, totalFlights }) => {
  if (!status) return null;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'10px', fontFamily:"'IBM Plex Mono',monospace" }}>
      <span style={{ fontSize:'13px', animation:'ctapulse 0.8s ease-in-out infinite', display:'inline-block' }}>✈</span>
      <span style={{ fontSize:'10px', color:'var(--electric)', letterSpacing:'.05em' }}>
        <span style={{ color:'var(--text-secondary)' }}>SCANNING </span>
        <span style={{ fontWeight:700 }}>{status.origin_name || status.origin}</span>
        <span style={{ color:'var(--text-muted)', margin:'0 4px' }}>→</span>
        <span style={{ fontWeight:700 }}>{status.dest_name || status.dest}</span>
      </span>
      <span style={{
        fontSize:'9px', letterSpacing:'.12em', fontWeight:700,
        padding:'2px 7px', borderRadius:'20px',
        background:'rgba(56,189,248,0.1)', border:'1px solid rgba(56,189,248,0.3)',
        color:'var(--electric)',
      }}>{status.combo}/{status.total}</span>
      {totalFlights > 0 && (
        <span style={{ fontSize:'9px', color:'var(--text-muted)', letterSpacing:'.08em' }}>
          {totalFlights} found so far
        </span>
      )}
    </div>
  );
};

const Tag = ({ children, color = 'electric' }) => {
  const c = color === 'amber' ? { bg:'var(--amber-dim)', text:'var(--amber)', border:'var(--amber-dim)' }
                              : { bg:'var(--electric-dim)', text:'var(--electric)', border:'var(--electric-dim)' };
  return (
    <span style={{
      fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', letterSpacing:'.2em',
      textTransform:'uppercase', fontWeight:700, padding:'3px 8px', borderRadius:'20px',
      background: c.bg, color: c.text, border:`1px solid ${c.border}`,
    }}>
      {children}
    </span>
  );
};

const FieldLabel = ({ icon, children }) => (
  <div style={{
    fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', letterSpacing:'.2em',
    color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'7px',
    display:'flex', alignItems:'center', gap:'5px',
  }}>
    <span style={{ color:'var(--electric)', fontSize:'8px' }}>{icon}</span>
    {children}
  </div>
);

/* ─── Top Pick card ──────────────────────────────────────────────────────── */

const TopPickCard = ({ flight, rank }) => {
  const isAlt       = flight.is_nearby;
  const originLabel = flight.origin_name || flight.origin || '—';
  const destLabel   = flight.destination_name || flight.destination || '—';
  const accentColor = isAlt ? 'var(--amber)' : 'var(--electric)';
  const accentDim   = isAlt ? 'var(--amber-dim)' : 'var(--electric-dim)';
  const isNonstop   = flight.stops === 'Nonstop';
  const hasTime     = flight.departure_time || flight.arrival_time;

  return (
    <div style={{
      background: 'linear-gradient(145deg, #0e2038 0%, #07111c 100%)',
      border: `1px solid ${accentDim}`,
      borderRadius:'12px', padding:'14px', position:'relative', overflow:'hidden',
    }}>
      {/* Triangle corner accent */}
      <div style={{
        position:'absolute', top:0, right:0, width:0, height:0,
        borderStyle:'solid', borderWidth:'0 52px 52px 0',
        borderColor: `transparent ${accentDim} transparent transparent`,
      }} />
      <div style={{
        position:'absolute', top:'7px', right:'5px',
        fontFamily:"'IBM Plex Mono',monospace", fontSize:'8px',
        fontWeight:700, color: accentColor, letterSpacing:'.1em',
      }}>
        {rank === 0 ? '★ BEST' : 'ALT'}
      </div>

      {/* Badge + stops row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
        <div style={{
          fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', fontWeight:700,
          letterSpacing:'.18em', textTransform:'uppercase', color: accentColor,
        }}>
          {flight.badge}
        </div>
        {flight.stops && (
          <span style={{
            fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
            padding:'2px 8px', borderRadius:'20px',
            background: isNonstop ? 'rgba(52,211,153,0.1)' : 'rgba(100,116,139,0.2)',
            color: isNonstop ? '#34d399' : 'var(--text-muted)',
            border: `1px solid ${isNonstop ? 'rgba(52,211,153,0.3)' : 'var(--border)'}`,
          }}>
            {flight.stops}
          </span>
        )}
      </div>

      {/* Price + airline */}
      <div style={{
        fontFamily:"'Playfair Display',serif", fontSize:'22px', fontWeight:900,
        color:'var(--text-primary)', lineHeight:1, marginBottom:'3px',
      }}>
        ₹{(flight.price ?? 0).toLocaleString('en-IN')}
      </div>
      <div style={{
        fontFamily:"'IBM Plex Mono',monospace", fontSize:'10px',
        color:'var(--text-muted)', marginBottom:'16px', letterSpacing:'.05em',
      }}>
        {flight.airline}
      </div>

      {/* Time row — always shown; fields show — if scraping missed them */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          background:'rgba(0,0,0,0.3)', borderRadius:'8px', padding:'7px 8px',
          marginBottom:'10px',
        }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'12px', fontWeight:700, color:'var(--text-primary)' }}>
              {flight.departure_time || '—'}
            </div>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', color:'var(--text-muted)', marginTop:'2px' }}>
              {flight.origin || '—'}
            </div>
          </div>
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'0 8px' }}>
            {flight.duration && (
              <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', color:'var(--text-muted)', marginBottom:'4px' }}>
                {flight.duration}
              </span>
            )}
            <div style={{ width:'100%', display:'flex', alignItems:'center', gap:'4px' }}>
              <div style={{ flex:1, height:'1px', background:'var(--border)' }} />
              <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>✈</span>
              <div style={{ flex:1, height:'1px', background:'var(--border)' }} />
            </div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'12px', fontWeight:700, color:'var(--text-primary)' }}>
              {flight.arrival_time || '—'}
            </div>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', color:'var(--text-muted)', marginTop:'2px' }}>
              {flight.destination || '—'}
            </div>
          </div>
        </div>

      <div className="glow-rule" style={{ marginBottom:'14px' }} />

      {/* Airport name row */}
      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
        <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'10px', color:'var(--text-secondary)', flex:'0 0 auto', maxWidth:'110px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {originLabel}
        </span>
        <div style={{ flex:1, borderTop:'1px dashed var(--border)' }} />
        <div style={{ flex:1, borderTop:'1px dashed var(--border)' }} />
        <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'10px', color:'var(--text-secondary)', flex:'0 0 auto', maxWidth:'110px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'right' }}>
          {destLabel}
        </span>
      </div>
    </div>
  );
};

/* ─── Main NavigatorUI ───────────────────────────────────────────────────── */

const NavigatorUI = () => {
  const [hasError, setHasError]       = useState(false);
  const [errorCode, setErrorCode]     = useState("UNKNOWN_ERROR");
  const [errorMsg, setErrorMsg]       = useState("");
  const [isLoading, setIsLoading]     = useState(false);
  const [validationError, setValidationError] = useState("");

  const [origin, setOrigin]           = useState("Pune");
  const [destination, setDestination] = useState("Kolkata");
  const [date, setDate]               = useState(new Date().toISOString().split("T")[0]);
  const [confirmedOrigin, setConfirmedOrigin] = useState("Pune");
  const [confirmedDest,   setConfirmedDest]   = useState("Kolkata");
  const [flexDate, setFlexDate]           = useState(false);   // ±3 day flexible search
  const [flexProgress, setFlexProgress]   = useState({ done: 0, total: 0 }); // progress counter
  // Streaming scan status — shows "Scanning PNQ → CCU (2/6)" while scraping
  const [scanStatus, setScanStatus] = useState(null);
  // { origin, origin_name, dest, dest_name, combo, total } | null
  // Holds last known status so banner stays in 'scanning' phase between pairs
  const lastScanRef = useRef(null);

  const [flights, setFlights] = useState(mockResults.all_options ?? []);
  const [insight, setInsight] = useState(mockResults.ai_insight ?? null);
  const [sortOrder, setSortOrder]     = useState('asc');
  const [selectedFlight, setSelectedFlight] = useState(null);

  // Primary IATA codes locked at search time — passed to ResultsGrid so
  // nearby badges can say "Alt. Origin", "Alt. Destination", or "Alt. Origin + Dest"
  const [primaryOrigin, setPrimaryOrigin] = useState(mockResults.all_options?.[0]?.origin ?? "");
  const [primaryDest,   setPrimaryDest]   = useState(mockResults.all_options?.[0]?.destination ?? "");

  const handleSwap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  // Parse "2 hr 10 min" → total minutes for tie-breaking
  const durationToMins = (dur) => {
    if (!dur) return Infinity;
    const h = parseInt(dur.match(/(\d+)\s*hr/)?.[1]  ?? 0);
    const m = parseInt(dur.match(/(\d+)\s*min/)?.[1] ?? 0);
    return h * 60 + m;
  };

  const { topPicks, sortedFlights } = useMemo(() => {
    if (!flights?.length) return { topPicks: [], sortedFlights: [] };

    const sorted = [...flights].sort((a, b) => {
      if (sortOrder === 'asc')  return a.price - b.price;
      if (sortOrder === 'desc') return b.price - a.price;
      if (sortOrder === 'date') return (a.departure_date ?? '').localeCompare(b.departure_date ?? '');
      if (sortOrder === 'dur')  return durationToMins(a.duration) - durationToMins(b.duration);
      return 0;
    });

    const valid = flights.filter(f => f.price > 0);
    if (!valid.length) return { topPicks: [], sortedFlights: sorted };

    // Price-first, duration tie-breaker
    const cheapest = (arr) => arr.reduce((p, c) => {
      if (c.price < p.price) return c;
      if (c.price === p.price && durationToMins(c.duration) < durationToMins(p.duration)) return c;
      return p;
    });

    const best    = cheapest(valid);
    // Exact route: both origin and dest are primary (is_nearby=false)
    const exact   = valid.filter(f => !f.is_nearby);
    const srcBest = exact.length ? cheapest(exact) : null;

    const picks = [{ ...best, badge: 'Best Overall Price' }];
    // Only add second pick if it is genuinely a different flight
    if (srcBest && srcBest.price !== best.price)
      picks.push({ ...srcBest, badge: `Best from ${confirmedOrigin}` });

    return { topPicks: picks, sortedFlights: sorted };
  }, [flights, sortOrder, confirmedOrigin]);

  // ── Date helpers ─────────────────────────────────────────────────────────
  const addDays = (dateStr, n) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  };

  const getFlexDates = useCallback((baseDate) => {
    // Returns [-3, -2, -1, 0, +1, +2, +3] dates around baseDate
    return [-3, -2, -1, 0, 1, 2, 3].map(n => addDays(baseDate, n));
  }, []);

  // ── Dedup helper for merged multi-date results ────────────────────────────
  // Same key as backend flight_deduplicator — (airline, origin, dest, time, date)
  // Keeps the cheapest when two identical flights appear across scrape pairs.
  const deduplicateFlights = useCallback((flights) => {
    const seen = new Map();
    for (const f of flights) {
      const key = [
        f.airline?.toLowerCase().trim(),
        f.origin,
        f.destination,
        f.departure_time,
        f.departure_date,
      ].join('|');
      if (!seen.has(key) || f.price < seen.get(key).price) {
        seen.set(key, f);
      }
    }
    return Array.from(seen.values());
  }, []);

  // ── Streaming search — single date via /search/stream (NDJSON) ─────────────
  const streamSearch = useCallback(async (travelDate) => {
    const params = new URLSearchParams({
      source_city:      origin.trim(),
      destination_city: destination.trim(),
      travel_date:      travelDate,
    });

    const response = await fetch(
      `http://127.0.0.1:8000/search/stream?${params}`,
      { method: 'GET', headers: { Accept: 'application/x-ndjson' } }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Stream error ${response.status}: ${errText}`);
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    // Accumulate all flights from this stream for returning to caller
    const allFlights = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let event;
        try { event = JSON.parse(trimmed); }
        catch { continue; }

        if (event.type === 'airports') {
          // We now know how many combos are coming
          const total = (event.origins?.length ?? 1) * (event.dests?.length ?? 1);
          setFlexProgress({ done: 0, total });
          // Lock in primary IATA codes immediately
          if (event.origins?.[0]) setPrimaryOrigin(event.origins[0]);
          if (event.dests?.[0])   setPrimaryDest(event.dests[0]);

        } else if (event.type === 'status') {
          // Update the scanning indicator
          const newStatus = {
            origin:      event.origin,
            origin_name: event.origin_name,
            dest:        event.dest,
            dest_name:   event.dest_name,
            combo:       event.combo,
            total:       event.total,
          };
          lastScanRef.current = newStatus;
          setScanStatus(newStatus);
          setFlexProgress({ done: event.combo - 1, total: event.total });

        } else if (event.type === 'flights') {
          // Pop new flights into the grid immediately
          const incoming = event.flights ?? [];
          allFlights.push(...incoming);
          setFlights(prev => {
            const merged = deduplicateFlights([...prev, ...incoming]);
            merged.sort((a, b) => a.price - b.price);
            return merged;
          });
          setFlexProgress(p => ({ ...p, done: event.combo ?? p.done + 1 }));

        } else if (event.type === 'done') {
          setScanStatus(null);   // triggers insight phase — lastScanRef retains last pair
          setFlexProgress({ done: event.total_flights ?? 0, total: 0 });

        } else if (event.type === 'error') {
          console.warn('Stream error event:', event.msg);
        }
      }
    }

    return allFlights;
  }, [origin, destination, deduplicateFlights]);

  // ── Main search handler ───────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!origin.trim() || !destination.trim() || !date) {
      setValidationError('INCOMPLETE FLIGHT PLAN — PLEASE FILL ALL FIELDS');
      return;
    }
    setValidationError('');
    setIsLoading(true);
    setHasError(false);
    setFlights([]);
    setInsight(null);
    setPrimaryOrigin('');
    setPrimaryDest('');
    setScanStatus(null);
    lastScanRef.current = null;
    setSelectedFlight(null);
    setConfirmedOrigin(origin.trim());
    setConfirmedDest(destination.trim());

    try {
      if (!flexDate) {
        // ── Single date streaming search ──────────────────────────────────
        const allFlights = await streamSearch(date);

        // Once stream is done, request Gemini insight via existing /search
        // (insight needs the full flight list — not worth streaming separately)
        if (allFlights.length > 0) {
          const insightRes = await fetch('http://127.0.0.1:8000/search', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source_city:      origin.trim(),
              destination_city: destination.trim(),
              travel_date:      date,
            }),
          });
          const insightData = await insightRes.json();
          setInsight(insightData?.ai_insight ?? null);
        }

      } else {
        // ── Flexible ±3 days: stream each date sequentially ───────────────
        // Sequential (not parallel) to avoid hammering Playwright with 7
        // simultaneous browsers. Results still pop in city-by-city.
        const dates = getFlexDates(date);
        setFlexProgress({ done: 0, total: dates.length });

        for (const d of dates) {
          await streamSearch(d);
        }

        // Gemini insight on the base date
        const insightRes = await fetch('http://127.0.0.1:8000/search', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_city:      origin.trim(),
            destination_city: destination.trim(),
            travel_date:      date,
          }),
        });
        const insightData = await insightRes.json();
        setInsight(insightData?.ai_insight ?? null);
      }

    } catch (err) {
      setErrorCode(err?.status ?? 'NETWORK_ERROR');
      setErrorMsg(err?.message ?? 'Connection failed');
      setHasError(true);
    } finally {
      setIsLoading(false);
      setScanStatus(null);
      setFlexProgress({ done: 0, total: 0 });
    }
  };

  if (hasError) {
    return <ErrorPage onRetry={() => setHasError(false)} message={errorMsg} errorCode={String(errorCode)} />;
  }

  /* shared input style */
  const inputStyle = {
    width:'100%', background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:'8px', padding:'11px 14px', color:'var(--text-primary)',
    fontFamily:"'IBM Plex Mono',monospace", fontSize:'13px', letterSpacing:'.02em',
  };

  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <div className="scanlines" style={{ minHeight:'100vh', background:'var(--ink)' }}>

        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <header style={{
          background:'var(--panel)', borderBottom:'1px solid var(--border)',
          padding:'7px 32px', display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
            <span style={{ fontSize:'16px' }}>✈</span>
            <span style={{
              fontFamily:"'Playfair Display',serif", fontSize:'15px',
              fontWeight:700, letterSpacing:'.08em', color:'var(--text-primary)',
            }}>NAVIGATOR</span>
            <span style={{
              fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
              color:'var(--text-muted)', letterSpacing:'.2em',
              borderLeft:'1px solid var(--border)', paddingLeft:'14px',
            }}>ROUTE OPTIMIZER v2.0</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'20px' }}>
            <RunwayDots />
            <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
              <div style={{
                width:'7px', height:'7px', borderRadius:'50%',
                background: isLoading ? 'var(--amber)' : '#34d399',
                ...(isLoading ? { animation:'ctapulse 1s infinite' } : {}),
              }} />
              <span style={{
                fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                color:'var(--text-muted)', letterSpacing:'.15em',
              }}>
                {isLoading ? 'SCANNING ROUTES' : 'SYSTEM NOMINAL'}
              </span>
            </div>
          </div>
        </header>

        {/* ── Search panel ─────────────────────────────────────────────────── */}
        <div style={{
          background:'linear-gradient(135deg, #0f2744 0%, #112240 40%, #0d1f35 100%)',
          borderBottom:'1px solid #1e3a5f',
          boxShadow:'0 4px 24px rgba(0,0,0,0.3)',
          padding:'20px 32px 22px',
        }}>
          <div style={{ maxWidth:'62%' }}>

            {/* Headline */}
            <div className="rise" style={{ marginBottom:'16px', display:'flex', alignItems:'baseline', gap:'14px', flexWrap:'wrap' }}>
              <h1 style={{
                fontFamily:"'Playfair Display',serif",
                fontSize:'clamp(16px,1.8vw,24px)', fontWeight:900,
                lineHeight:1.1, letterSpacing:'-.02em', color:'#f0f7ff',
                whiteSpace:'nowrap',
              }}>
                Find the Cheapest&nbsp;<span style={{ color:'#60c8f5' }}>Flight Home.</span>
              </h1>
              <p style={{
                fontFamily:"'Crimson Pro',serif", fontSize:'13px', fontStyle:'italic',
                color:'#7aa3c4', whiteSpace:'nowrap',
              }}>
                We scan your city and every nearby airport — so you never overpay.
              </p>
            </div>

            {/* 2-column card: left = cities, right = date + CTA */}
            <div className="rise-2" style={{
              display:'grid', gridTemplateColumns:'1fr 1fr',
              gap:'16px', alignItems:'start',
            }}>

              {/* Left col: Origin → Destination stacked with swap */}
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                <div>
                  <FieldLabel icon="◎">Origin City</FieldLabel>
                  <input type="text" value={origin} onChange={e=>setOrigin(e.target.value)}
                    placeholder="e.g. Pune" className="nav-input"
                    style={{ ...inputStyle, background:'rgba(255,255,255,0.07)', borderColor:'#1e3a5f', color:'#f0f7ff' }} />
                </div>
                {/* Swap link between the two city fields */}
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <div style={{ flex:1, height:'1px', background:'#1e3a5f' }} />
                  <button onClick={handleSwap} aria-label="Swap" style={{
                    padding:'3px 10px', background:'rgba(56,189,248,0.1)',
                    border:'1px solid rgba(56,189,248,0.25)', borderRadius:'20px',
                    color:'#60c8f5', fontSize:'11px', cursor:'pointer',
                    fontFamily:"'IBM Plex Mono',monospace", letterSpacing:'.08em',
                    transition:'all .2s',
                  }}
                  onMouseEnter={e=>{ e.currentTarget.style.background='rgba(56,189,248,0.2)'; }}
                  onMouseLeave={e=>{ e.currentTarget.style.background='rgba(56,189,248,0.1)'; }}
                  >⇄ swap</button>
                  <div style={{ flex:1, height:'1px', background:'#1e3a5f' }} />
                </div>
                <div>
                  <FieldLabel icon="◎">Destination City</FieldLabel>
                  <input type="text" value={destination} onChange={e=>setDestination(e.target.value)}
                    placeholder="e.g. Kolkata" className="nav-input"
                    style={{ ...inputStyle, background:'rgba(255,255,255,0.07)', borderColor:'#1e3a5f', color:'#f0f7ff' }} />
                </div>
              </div>

              {/* Right col: Date (with ±3 toggle) → Optimize button stacked */}
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'7px' }}>
                    <FieldLabel icon="◈">Travel Date</FieldLabel>
                    <button
                      onClick={() => setFlexDate(f => !f)}
                      title="Search ±3 days around your date for cheaper options"
                      style={{
                        fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                        fontWeight:700, letterSpacing:'.12em',
                        padding:'2px 8px', borderRadius:'20px', cursor:'pointer',
                        border:`1px solid ${flexDate ? '#f59e0b' : '#1e3a5f'}`,
                        background: flexDate ? 'rgba(245,158,11,0.15)' : 'transparent',
                        color: flexDate ? '#f59e0b' : '#7aa3c4',
                        transition:'all .2s',
                      }}
                    >
                      ±3 DAYS
                    </button>
                  </div>
                  <input type="date" value={date} onChange={e=>setDate(e.target.value)}
                    className="nav-input"
                    min={new Date().toISOString().split('T')[0]}
                    style={{
                      ...inputStyle, colorScheme:'dark',
                      background:'rgba(255,255,255,0.07)', color:'#f0f7ff',
                      borderColor: flexDate ? '#6b3f07' : '#1e3a5f',
                    }} />
                  {flexDate && (
                    <div style={{
                      fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                      color:'#f59e0b', marginTop:'5px', letterSpacing:'.08em',
                    }}>
                      searching {date ? `${addDays(date,-3)} → ${addDays(date,3)}` : '7 dates'}
                    </div>
                  )}
                </div>

                {/* Optimize button — full width, flush below date */}
                <button onClick={handleSearch} disabled={isLoading}
                  className={isLoading ? '' : 'cta-pulse'}
                  style={{
                    width:'100%', height:'44px',
                    background: isLoading ? 'rgba(255,255,255,0.05)' : '#f59e0b',
                    border: isLoading ? '1px solid #1e3a5f' : 'none',
                    borderRadius:'8px',
                    color: isLoading ? '#7aa3c4' : '#000',
                    fontFamily:"'IBM Plex Mono',monospace", fontSize:'11px',
                    fontWeight:700, letterSpacing:'.12em',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    transition:'all .2s',
                  }}
                >
                  {isLoading
                    ? scanStatus
                      ? `✈ ${scanStatus.origin} → ${scanStatus.dest}`
                      : flexDate && flexProgress.total > 0
                        ? `● ${flexProgress.done}/${flexProgress.total} DATES`
                        : '● CONNECTING...'
                    : '▶ RUN FLIGHT INTELLIGENCE'}
                </button>
              </div>
            </div>
          </div>

          {/* Validation error */}
          {validationError && (
            <div style={{
              marginTop:'12px', display:'flex', alignItems:'center', gap:'8px',
              fontFamily:"'IBM Plex Mono',monospace", fontSize:'10px',
              color:'#f87171', letterSpacing:'.15em',
            }}>
              <span>⚠</span>{validationError}
            </div>
          )}
        </div>

        {/* ── Loading banner — sticky, visible for entire search duration ── */}
        <LoadingBanner
          isLoading={isLoading}
          scanStatus={scanStatus}
          lastScan={lastScanRef.current}
          flightCount={flights.length}
          flexDate={flexDate}
        />

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div style={{ padding:'20px 32px', maxWidth:'1600px', margin:'0 auto' }}>

          {/* ── TOP ZONE: Picks (left) + Gemini Insight (right, 1.4fr) ── */}
          <div style={{
            display:'grid', gridTemplateColumns:'0.6fr 1.4fr', gap:'24px',
            alignItems:'start', marginBottom:'8px',
          }}>
            {/* Picks — left */}
            <div>
              {!isLoading && topPicks.length > 0 && (
                <section className="rise">
                  <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'12px' }}>
                    <span style={{
                      fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                      letterSpacing:'.25em', color:'var(--electric)', textTransform:'uppercase', fontWeight:700,
                    }}>◈ Recommended Picks</span>
                    <div style={{ flex:1, height:'1px', background:'var(--border)' }} />
                  </div>
                  <div style={{
                    display:'grid',
                    gridTemplateColumns:'repeat(auto-fill, minmax(180px, 200px))',
                    gap:'12px',
                  }}>
                    {topPicks.map((f,i) => <TopPickCard key={`tp-${i}`} flight={f} rank={i} />)}
                  </div>
                </section>
              )}
            </div>

            {/* Gemini Insight — right, takes 1.4fr (was chatbot width) */}
            <div style={{
              position:'sticky', top:'16px',
              maxHeight:'calc(50vh - 16px)',
              overflowY:'auto', overflowX:'hidden',
            }}>
              <InsightSidebar insight={insight} />
            </div>
          </div>

          {/* ── BOTTOM ZONE: Routes (left) + Flight Assistant (right, 480px) ── */}
          <div style={{
            display:'grid', gridTemplateColumns:'1fr 480px', gap:'24px',
            alignItems:'start',
          }}>
            {/* Routes — left */}
            <div style={{ minWidth:0 }}>
              {/* Cost Calculator */}
              {selectedFlight && (
                <CostCalculator
                  flight={selectedFlight}
                  onClose={() => setSelectedFlight(null)}
                />
              )}

              <div className="rise-2">
                <div style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <span style={{
                      fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                      letterSpacing:'.25em', color:'var(--text-muted)', textTransform:'uppercase',
                    }}>◈ All Available Routes</span>
                    {!isLoading && sortedFlights.length > 0 && (
                      <Tag>{sortedFlights.length} ROUTES</Tag>
                    )}
                    {flexDate && !isLoading && (
                      <Tag color="amber">±3 DAYS</Tag>
                    )}
                    {/* Live scan indicator — city pair currently being scraped */}
                    {isLoading && (
                      <ScanIndicator status={scanStatus} totalFlights={flights.length} />
                    )}
                    {flexDate && isLoading && flexProgress.total > 0 && (
                      <span style={{
                        fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                        color:'var(--amber)', letterSpacing:'.1em',
                      }}>
                        {flexProgress.done}/{flexProgress.total} dates scanned
                      </span>
                    )}
                  </div>
                  <select value={sortOrder} onChange={e=>setSortOrder(e.target.value)}
                    className="nav-select"
                    style={{
                      background:'var(--surface)', border:'1px solid var(--border)',
                      borderRadius:'6px', padding:'6px 12px',
                      color:'var(--text-secondary)', fontFamily:"'IBM Plex Mono',monospace",
                      fontSize:'10px', letterSpacing:'.05em',
                    }}
                  >
                    <option value="asc">PRICE ↑ LOW → HIGH</option>
                    <option value="desc">PRICE ↓ HIGH → LOW</option>
                    <option value="date">DATE ↑ EARLIEST FIRST</option>
                    <option value="dur">DURATION ↑ SHORTEST FIRST</option>
                  </select>
                </div>
                {isLoading ? <LoadingSkeleton /> : <ResultsGrid flights={sortedFlights} primaryOrigin={primaryOrigin} primaryDest={primaryDest} flexDate={flexDate} onSelect={setSelectedFlight} selectedFlight={selectedFlight} />}
              </div>
            </div>

            {/* Flight Assistant — right, 480px (was Gemini width) */}
            <div style={{ position:'sticky', top:'16px' }}>
              <FlightChatbot
                flights={flights}
                originCity={confirmedOrigin}
                destName={confirmedDest}
                isSearching={isLoading}
              />
            </div>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer style={{
          borderTop:'1px solid var(--border)', padding:'14px 32px',
          display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <span style={{
            fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
            color:'var(--text-muted)', letterSpacing:'.2em',
          }}>POWERED BY GEMINI AI · AMADEUS API</span>
          <RunwayDots />
        </footer>
      </div>
    </>
  );
};

export default NavigatorUI;