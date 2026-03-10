import React from 'react';

const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatPrice = (price) => {
  if (price == null || isNaN(price)) return "N/A";
  return `₹${price.toLocaleString('en-IN')}`;
};

const getNearbyLabel = (flight, primaryOrigin, primaryDest) => {
  if (!flight.is_nearby) return null;
  if (!primaryOrigin || !primaryDest) return "Alternative Airport";
  const altOrigin = flight.origin      !== primaryOrigin;
  const altDest   = flight.destination !== primaryDest;
  if (altOrigin && altDest) return "Alt. Origin + Dest";
  if (altOrigin)            return "Alt. Origin";
  if (altDest)              return "Alt. Destination";
  return "Alternative Airport";
};

const ResultsGrid = ({ flights, primaryOrigin, primaryDest, flexDate = false, onSelect, selectedFlight }) => {

  if (!flights || flights.length === 0) {
    return (
      <div style={{
        display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'center', padding:'48px 24px',
        border:'2px dashed #1b3149', borderRadius:'16px',
        background:'rgba(12,25,41,0.5)',
      }}>
        <div style={{ fontSize:'48px', marginBottom:'16px', opacity:.4 }}>✈️</div>
        <h3 style={{
          fontFamily:"'IBM Plex Mono',monospace", fontSize:'15px',
          color:'#6d8aaa', fontWeight:500, marginBottom:'8px',
        }}>No flights to show yet</h3>
        <p style={{
          fontFamily:"'IBM Plex Mono',monospace", fontSize:'11px',
          color:'#33526b', textAlign:'center', maxWidth:'260px', lineHeight:1.6,
        }}>
          Enter your travel details above and click Optimize Route to see available options.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      display:'grid',
      gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))',
      gap:'16px',
    }}>
      {flights.map((flight, idx) => {
        const key         = `${flight.origin}-${flight.destination}-${flight.airline}-${flight.departure_time}-${idx}`;
        const isSelected  = selectedFlight && selectedFlight.airline === flight.airline && selectedFlight.origin === flight.origin && selectedFlight.destination === flight.destination && selectedFlight.departure_time === flight.departure_time && selectedFlight.departure_date === flight.departure_date;
        const originLabel = flight.origin_name      || flight.origin      || '—';
        const destLabel   = flight.destination_name || flight.destination || '—';
        const nearbyLabel = getNearbyLabel(flight, primaryOrigin, primaryDest);
        const hasTime     = flight.departure_time   || flight.arrival_time;
        const isNonstop   = flight.stops === 'Nonstop';

        return (
          <div key={key} style={{
            background:'#0c1929',
            border:`1px solid ${isSelected ? '#f59e0b' : '#1b3149'}`,
            borderRadius:'14px', padding:'20px',
            transition:'border-color .2s, box-shadow .2s',
            display:'flex', flexDirection:'column', gap:'0',
            boxShadow: isSelected ? '0 4px 24px rgba(245,158,11,0.12)' : 'none',
          }}
          onMouseEnter={e => {
            if (!isSelected) {
              e.currentTarget.style.borderColor = '#38bdf8';
              e.currentTarget.style.boxShadow   = '0 4px 24px rgba(56,189,248,0.08)';
            }
          }}
          onMouseLeave={e => {
            if (!isSelected) {
              e.currentTarget.style.borderColor = '#1b3149';
              e.currentTarget.style.boxShadow   = 'none';
            }
          }}
          >

            {/* ── Row 1: Airline + Stops badge | Price ── */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                <span style={{
                  fontFamily:"'IBM Plex Mono',monospace", fontSize:'10px', fontWeight:700,
                  letterSpacing:'.15em', textTransform:'uppercase',
                  background:'rgba(56,189,248,0.1)', color:'#38bdf8',
                  border:'1px solid rgba(56,189,248,0.2)',
                  padding:'3px 10px', borderRadius:'20px',
                }}>
                  {flight.airline}
                </span>
                <span style={{
                  fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                  padding:'2px 8px', borderRadius:'20px', width:'fit-content',
                  background: isNonstop ? 'rgba(52,211,153,0.1)' : 'rgba(100,116,139,0.15)',
                  color:       isNonstop ? '#34d399'              : '#6d8aaa',
                  border:     `1px solid ${isNonstop ? 'rgba(52,211,153,0.3)' : '#1b3149'}`,
                }}>
                  {flight.stops || 'Unknown'}
                </span>
              </div>
              <span style={{
                fontFamily:"'Playfair Display',serif", fontSize:'24px',
                fontWeight:900, color:'#dde8f5',
              }}>
                {formatPrice(flight.price)}
              </span>
            </div>

            {/* ── Row 2: Time bar — always shown; fields show — if scraping missed them ── */}
            <div style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                background:'rgba(0,0,0,0.3)', borderRadius:'8px',
                padding:'10px 14px', marginBottom:'16px',
              }}>
                {/* Departure */}
                <div style={{ textAlign:'center', minWidth:'60px' }}>
                  <div style={{
                    fontFamily:"'IBM Plex Mono',monospace", fontSize:'16px',
                    fontWeight:700, color:'#dde8f5',
                  }}>
                    {flight.departure_time || '—'}
                  </div>
                  <div style={{
                    fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                    color:'#33526b', marginTop:'3px', letterSpacing:'.05em',
                  }}>
                    {flight.origin || '—'}
                  </div>
                </div>

                {/* Duration + line */}
                <div style={{
                  flex:1, display:'flex', flexDirection:'column',
                  alignItems:'center', padding:'0 10px',
                }}>
                  {flight.duration && (
                    <span style={{
                      fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                      color:'#33526b', marginBottom:'5px', letterSpacing:'.05em',
                    }}>
                      {flight.duration}
                    </span>
                  )}
                  <div style={{ width:'100%', display:'flex', alignItems:'center', gap:'4px' }}>
                    <div style={{ flex:1, height:'1px', background:'#1b3149' }} />
                    <span style={{ fontSize:'12px', color:'#33526b' }}>✈</span>
                    <div style={{ flex:1, height:'1px', background:'#1b3149' }} />
                  </div>
                </div>

                {/* Arrival */}
                <div style={{ textAlign:'center', minWidth:'60px' }}>
                  <div style={{
                    fontFamily:"'IBM Plex Mono',monospace", fontSize:'16px',
                    fontWeight:700, color:'#dde8f5',
                  }}>
                    {flight.arrival_time || '—'}
                  </div>
                  <div style={{
                    fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                    color:'#33526b', marginTop:'3px', letterSpacing:'.05em',
                  }}>
                    {flight.destination || '—'}
                  </div>
                </div>
              </div>

            {/* ── Row 3: From / To airport names ── */}
            <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'16px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px' }}>
                <span style={{
                  fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                  color:'#33526b', letterSpacing:'.1em', textTransform:'uppercase',
                  flexShrink:0,
                }}>From</span>
                <span style={{
                  fontFamily:"'IBM Plex Mono',monospace", fontSize:'10px',
                  color:'#6d8aaa', textAlign:'right',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                  maxWidth:'200px',
                }}>
                  {originLabel}
                </span>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px' }}>
                <span style={{
                  fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                  color:'#33526b', letterSpacing:'.1em', textTransform:'uppercase',
                  flexShrink:0,
                }}>To</span>
                <span style={{
                  fontFamily:"'IBM Plex Mono',monospace", fontSize:'10px',
                  color:'#6d8aaa', textAlign:'right',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                  maxWidth:'200px',
                }}>
                  {destLabel}
                </span>
              </div>
            </div>

            {/* ── Row 4: Date | Nearby badge ── */}
            <div style={{
              borderTop:'1px solid #1b3149', paddingTop:'12px',
              display:'flex', justifyContent:'space-between', alignItems:'center',
            }}>
              <span style={{
                fontFamily:"'IBM Plex Mono',monospace",
                fontSize: flexDate ? '11px' : '9px',
                fontWeight: flexDate ? 700 : 400,
                color: flexDate ? '#f59e0b' : '#33526b',
                letterSpacing:'.08em', textTransform:'uppercase',
                padding: flexDate ? '2px 8px' : '0',
                background: flexDate ? 'rgba(245,158,11,0.1)' : 'transparent',
                border: flexDate ? '1px solid rgba(245,158,11,0.25)' : 'none',
                borderRadius: flexDate ? '20px' : '0',
              }}>
                {formatDate(flight.departure_date)}
              </span>
              {nearbyLabel && (
                <span style={{
                  fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
                  padding:'2px 8px', borderRadius:'20px',
                  background:'rgba(245,158,11,0.1)', color:'#f59e0b',
                  border:'1px solid rgba(245,158,11,0.25)',
                }}>
                  {nearbyLabel}
                </span>
              )}
            </div>

            {/* ── Select button ── */}
            <button
              onClick={() => onSelect && onSelect(isSelected ? null : flight)}
              style={{
                marginTop: '14px',
                width: '100%', padding: '8px',
                background: isSelected ? 'rgba(245,158,11,0.12)' : 'rgba(56,189,248,0.06)',
                border: `1px solid ${isSelected ? 'rgba(245,158,11,0.4)' : 'rgba(56,189,248,0.2)'}`,
                borderRadius: '8px',
                color: isSelected ? '#f59e0b' : '#38bdf8',
                fontFamily: "'IBM Plex Mono',monospace", fontSize: '10px',
                fontWeight: 700, letterSpacing: '.12em', cursor: 'pointer',
                transition: 'all .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = isSelected ? 'rgba(245,158,11,0.2)' : 'rgba(56,189,248,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(245,158,11,0.12)' : 'rgba(56,189,248,0.06)'; }}
            >
              {isSelected ? '✕ DESELECT FLIGHT' : '🧮 SELECT · CALCULATE COST'}
            </button>

          </div>
        );
      })}
    </div>
  );
};

export default ResultsGrid;