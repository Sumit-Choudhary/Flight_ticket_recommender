import React, { useState, useMemo, useCallback } from 'react';
import axios from 'axios';
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
      borderRadius:'14px', padding:'22px', position:'relative', overflow:'hidden',
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
        fontFamily:"'Playfair Display',serif", fontSize:'36px', fontWeight:900,
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
          background:'rgba(0,0,0,0.3)', borderRadius:'8px', padding:'10px 12px',
          marginBottom:'16px',
        }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'15px', fontWeight:700, color:'var(--text-primary)' }}>
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
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'15px', fontWeight:700, color:'var(--text-primary)' }}>
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

  const [flights, setFlights] = useState([]);
  const [insight, setInsight] = useState(null);
  const [sortOrder, setSortOrder]     = useState('asc');
  const [selectedFlight, setSelectedFlight] = useState(null);

  // Primary IATA codes locked at search time — passed to ResultsGrid so
  // nearby badges can say "Alt. Origin", "Alt. Destination", or "Alt. Origin + Dest"
  const [primaryOrigin, setPrimaryOrigin] = useState("");
  const [primaryDest,   setPrimaryDest]   = useState("");

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

  // ── Single date search ────────────────────────────────────────────────────
  const searchOneDate = useCallback(async (travelDate) => {
    const res = await axios.post('http://127.0.0.1:8000/search', {
      source_city:      origin.trim(),
      destination_city: destination.trim(),
      travel_date:      travelDate,
    });
    return res.data?.all_options ?? [];
  }, [origin, destination]);

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
    setSelectedFlight(null);
    setConfirmedOrigin(origin.trim());
    setConfirmedDest(destination.trim());

    try {
      if (!flexDate) {
        // ── Standard single-date search ──────────────────────────────────
        const res = await axios.post('http://127.0.0.1:8000/search', {
          source_city:      origin.trim(),
          destination_city: destination.trim(),
          travel_date:      date,
        });
        const options = res.data?.all_options ?? [];
        setFlights(options);
        setInsight(res.data?.ai_insight ?? null);
        const pf = options.find(f => !f.is_nearby) ?? options[0];
        if (pf) { setPrimaryOrigin(pf.origin); setPrimaryDest(pf.destination); }

      } else {
        // ── Flexible ±3 day search ────────────────────────────────────────
        // Fire all 7 dates in parallel. Show a live progress counter.
        // Results stream in as each date completes — UI updates incrementally.
        const dates = getFlexDates(date);
        setFlexProgress({ done: 0, total: dates.length });

        const results = await Promise.allSettled(
          dates.map(d =>
            searchOneDate(d).then(options => {
              // Stream partial results in as each date resolves
              setFlights(prev => {
                const merged = deduplicateFlights([...prev, ...options]);
                merged.sort((a, b) => a.price - b.price);
                return merged;
              });
              setFlexProgress(p => ({ ...p, done: p.done + 1 }));
              return options;
            })
          )
        );

        // Use the first successful result to anchor primary IATA codes
        const firstSuccess = results.find(r => r.status === 'fulfilled' && r.value?.length);
        if (firstSuccess) {
          const pf = firstSuccess.value.find(f => !f.is_nearby) ?? firstSuccess.value[0];
          if (pf) { setPrimaryOrigin(pf.origin); setPrimaryDest(pf.destination); }
        }

        // Request Gemini insight using the base date search result
        // (insight on the full merged set would be overwhelming)
        const baseResult = results[3]; // index 3 = offset 0 = the selected date
        if (baseResult?.status === 'fulfilled') {
          const baseRes = await axios.post('http://127.0.0.1:8000/search', {
            source_city:      origin.trim(),
            destination_city: destination.trim(),
            travel_date:      date,
          });
          setInsight(baseRes.data?.ai_insight ?? null);
        }
      }

    } catch (err) {
      setErrorCode(err.response?.status ?? 'NETWORK_ERROR');
      setErrorMsg(err.response?.data?.detail ?? '');
      setHasError(true);
    } finally {
      setIsLoading(false);
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

        {/* ── Hero / Search panel ───────────────────────────────────────── */}
        <div style={{
          background:'linear-gradient(180deg, var(--panel) 0%, var(--ink) 100%)',
          borderBottom:'1px solid var(--border)', padding:'18px 32px 20px',
        }}>

          {/* Compact headline row */}
          <div className="rise" style={{ marginBottom:'16px', display:'flex', alignItems:'baseline', gap:'16px', flexWrap:'wrap' }}>
            <h1 style={{
              fontFamily:"'Playfair Display',serif",
              fontSize:'clamp(18px,2.2vw,28px)', fontWeight:900,
              lineHeight:1.1, letterSpacing:'-.02em', color:'var(--text-primary)',
              whiteSpace:'nowrap',
            }}>
              Find the Cheapest&nbsp;<span style={{ color:'var(--electric)' }}>Flights.</span>
            </h1>
            <p style={{
              fontFamily:"'Crimson Pro',serif", fontSize:'14px', fontStyle:'italic',
              color:'var(--text-secondary)', whiteSpace:'nowrap',
            }}>
              We also scan your origin and destination city and every nearby airports 
              — so you never overpay.
            </p>
          </div>

          {/* Search fields */}
          <div className="rise-2" style={{
            display:'grid',
            gridTemplateColumns:'1fr 44px 1fr 180px auto',
            gap:'12px', alignItems:'end', maxWidth:'920px',
          }}>

            {/* Origin */}
            <div>
              <FieldLabel icon="◎">Origin City</FieldLabel>
              <input type="text" value={origin} onChange={e=>setOrigin(e.target.value)}
                placeholder="e.g. Pune" className="nav-input" style={inputStyle} />
            </div>

            {/* Swap */}
            <div style={{ paddingBottom:'1px' }}>
              <button onClick={handleSwap} aria-label="Swap" style={{
                width:'44px', height:'44px', background:'var(--surface)',
                border:'1px solid var(--border)', borderRadius:'8px',
                color:'var(--electric)', fontSize:'16px', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'all .2s',
              }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor='var(--electric)'; e.currentTarget.style.color='var(--amber)'; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--electric)'; }}
              >⇄</button>
            </div>

            {/* Destination */}
            <div>
              <FieldLabel icon="◎">Destination City</FieldLabel>
              <input type="text" value={destination} onChange={e=>setDestination(e.target.value)}
                placeholder="e.g. Kolkata" className="nav-input" style={inputStyle} />
            </div>

            {/* Date + flex toggle */}
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'7px' }}>
                <FieldLabel icon="◈">Travel Date</FieldLabel>
                {/* ±3 day flex toggle */}
                <button
                  onClick={() => setFlexDate(f => !f)}
                  title="Search ±3 days around your date for cheaper options"
                  style={{
                    fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                    fontWeight:700, letterSpacing:'.12em',
                    padding:'2px 8px', borderRadius:'20px', cursor:'pointer',
                    border:`1px solid ${flexDate ? 'var(--amber)' : 'var(--border)'}`,
                    background: flexDate ? 'rgba(245,158,11,0.12)' : 'transparent',
                    color: flexDate ? 'var(--amber)' : 'var(--text-muted)',
                    transition:'all .2s',
                  }}
                >
                  ±3 DAYS
                </button>
              </div>
              <input type="date" value={date} onChange={e=>setDate(e.target.value)}
                className="nav-input"
                style={{
                  ...inputStyle, colorScheme:'dark',
                  borderColor: flexDate ? 'var(--amber-dim)' : undefined,
                }} />
              {flexDate && (
                <div style={{
                  fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                  color:'var(--amber)', marginTop:'5px', letterSpacing:'.08em',
                }}>
                  searching {date ? `${addDays(date,-3)} → ${addDays(date,3)}` : '7 dates'}
                </div>
              )}
            </div>

            {/* CTA */}
            <div style={{ paddingBottom:'1px' }}>
              <button onClick={handleSearch} disabled={isLoading}
                className={isLoading ? '' : 'cta-pulse'}
                style={{
                  width:'100%', height:'44px',
                  background: isLoading ? 'var(--surface)' : 'var(--amber)',
                  border:'none', borderRadius:'8px',
                  color: isLoading ? 'var(--text-muted)' : '#000',
                  fontFamily:"'IBM Plex Mono',monospace", fontSize:'11px',
                  fontWeight:700, letterSpacing:'.12em', cursor: isLoading ? 'not-allowed' : 'pointer',
                  whiteSpace:'nowrap', transition:'all .2s',
                }}
              >
                {isLoading
                  ? flexDate && flexProgress.total > 0
                    ? `● ${flexProgress.done}/${flexProgress.total} DATES`
                    : '● SCANNING...'
                  : '▶ OPTIMIZE'}
              </button>
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

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div style={{
          display:'grid', gridTemplateColumns:'1fr 340px', gap:'24px',
          padding:'20px 32px', maxWidth:'1400px', margin:'0 auto', alignItems:'start',
        }}>

          <main style={{ minWidth:0 }}>

            {/* Top Picks */}
            {!isLoading && topPicks.length > 0 && (
              <section className="rise" style={{ marginBottom:'44px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px' }}>
                  <span style={{
                    fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                    letterSpacing:'.25em', color:'var(--electric)', textTransform:'uppercase', fontWeight:700,
                  }}>◈ Recommended Picks</span>
                  <div style={{ flex:1, height:'1px', background:'var(--border)' }} />
                </div>
                <div style={{
                  display:'grid',
                  gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))',
                  gap:'16px',
                }}>
                  {topPicks.map((f,i) => <TopPickCard key={`tp-${i}`} flight={f} rank={i} />)}
                </div>
              </section>
            )}

            {/* Cost Calculator — shown when a flight is selected */}
            {selectedFlight && (
              <CostCalculator
                flight={selectedFlight}
                onClose={() => setSelectedFlight(null)}
              />
            )}

            {/* All routes */}
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
                  {flexDate && isLoading && flexProgress.total > 0 && (
                    <span style={{
                      fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                      color:'var(--amber)', letterSpacing:'.1em',
                    }}>
                      {flexProgress.done}/{flexProgress.total} dates loaded
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
          </main>

          {/* Right column — chatbot stacked above insight sidebar */}
          <aside style={{
            position:'sticky',
            top:'24px',
            display:'flex',
            flexDirection:'column',
            gap:'16px',
            maxHeight:'calc(100vh - 48px)',
          }}>
            {/* Chatbot — fixed height, never squeezed */}
            <div style={{ flexShrink:0 }}>
              <FlightChatbot
                flights={flights}
                originCity={confirmedOrigin}
                destName={confirmedDest}
                isSearching={isLoading}
              />
            </div>
            {/* Insight — takes remaining space, scrolls internally */}
            <div style={{ flex:1, minHeight:0, overflowY:'auto', overflowX:'hidden' }}>
              <InsightSidebar insight={insight} />
            </div>
          </aside>
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