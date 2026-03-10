import React, { useState, useEffect } from 'react';

/**
 * CostCalculator
 *
 * Slides in below the search bar when the user selects a flight.
 * Calculates total trip cost for:
 *   • Adults         — full fare (flight.price per person)
 *   • Children 2–12  — full fare (same as adult on most Indian carriers)
 *   • Infants < 2    — fixed flat rate (INFANT_FLAT_RATE), no seat assigned
 *
 * Props:
 *   flight   — the selected FlightOption object
 *   onClose  — callback to deselect / close this panel
 */

const INFANT_FLAT_RATE = 1500; // ₹ flat rate per infant (< 2 yrs), no seat

const CostCalculator = ({ flight, onClose }) => {
  const [adults,   setAdults]   = useState(1);
  const [children, setChildren] = useState(0);
  const [infants,  setInfants]  = useState(0);
  const [visible,  setVisible]  = useState(false);

  // Slide in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  // Reset counts when a different flight is selected
  useEffect(() => {
    setAdults(1);
    setChildren(0);
    setInfants(0);
  }, [flight?.airline, flight?.departure_time, flight?.origin]);

  const basePrice    = flight?.price ?? 0;
  const adultCost    = adults   * basePrice;
  const childCost    = children * basePrice;
  const infantCost   = infants  * INFANT_FLAT_RATE;
  const totalCost    = adultCost + childCost + infantCost;
  const totalPax     = adults + children + infants;

  const fmt = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 250);
  };

  /* ── Counter component ─────────────────────────────────────────────────── */
  const Counter = ({ label, sublabel, value, onChange, min = 0, max = 9, accent = '#38bdf8' }) => (
    <div style={{
      background: '#0a1824',
      border: '1px solid #1b3149',
      borderRadius: '12px',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px',
          fontWeight: 700, color: '#dde8f5', letterSpacing: '.06em',
        }}>{label}</div>
        <div style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: '9px',
          color: '#33526b', marginTop: '3px', letterSpacing: '.08em',
        }}>{sublabel}</div>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          style={{
            width: '28px', height: '28px', borderRadius: '50%', border: 'none',
            background: value <= min ? '#1b3149' : `rgba(${accent === '#38bdf8' ? '56,189,248' : accent === '#f59e0b' ? '245,158,11' : '167,139,250'},0.15)`,
            color: value <= min ? '#33526b' : accent,
            fontSize: '16px', cursor: value <= min ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .15s', lineHeight: 1,
          }}
        >−</button>

        <span style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: '18px',
          fontWeight: 700, color: accent, minWidth: '20px', textAlign: 'center',
        }}>{value}</span>

        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          style={{
            width: '28px', height: '28px', borderRadius: '50%', border: 'none',
            background: value >= max ? '#1b3149' : `rgba(${accent === '#38bdf8' ? '56,189,248' : accent === '#f59e0b' ? '245,158,11' : '167,139,250'},0.15)`,
            color: value >= max ? '#33526b' : accent,
            fontSize: '16px', cursor: value >= max ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .15s', lineHeight: 1,
          }}
        >+</button>
      </div>

      {/* Per-pax cost */}
      <div style={{
        fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px',
        color: '#33526b', minWidth: '72px', textAlign: 'right',
        letterSpacing: '.04em',
      }}>
        {value > 0
          ? <span style={{ color: accent }}>{fmt(value * (label === 'Infants' ? INFANT_FLAT_RATE : basePrice))}</span>
          : <span>—</span>}
      </div>
    </div>
  );

  return (
    <div style={{
      opacity:    visible ? 1 : 0,
      transform:  visible ? 'translateY(0)' : 'translateY(-12px)',
      transition: 'opacity .25s ease, transform .25s ease',
      background: 'linear-gradient(145deg, #0c1929, #07111c)',
      border:     '1px solid #1b3149',
      borderRadius: '16px',
      padding:    '20px 24px',
      marginBottom: '24px',
    }}>

      {/* ── Header row ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '16px' }}>🧮</span>
          <div>
            <div style={{
              fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px',
              fontWeight: 700, color: '#dde8f5', letterSpacing: '.08em',
            }}>COST CALCULATOR</div>
            <div style={{
              fontFamily: "'IBM Plex Mono',monospace", fontSize: '9px',
              color: '#33526b', letterSpacing: '.12em', textTransform: 'uppercase',
              marginTop: '2px',
            }}>
              {flight.airline} · {flight.origin} → {flight.destination}
              {flight.departure_time ? ` · ${flight.departure_time}` : ''}
            </div>
          </div>
        </div>

        {/* Base fare badge + close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontFamily: "'IBM Plex Mono',monospace", fontSize: '9px',
              color: '#33526b', letterSpacing: '.1em', textTransform: 'uppercase',
            }}>Base fare / pax</div>
            <div style={{
              fontFamily: "'Playfair Display',serif", fontSize: '20px',
              fontWeight: 900, color: '#dde8f5',
            }}>{fmt(basePrice)}</div>
          </div>
          <button onClick={handleClose} style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: '#1b3149', border: 'none', color: '#33526b',
            fontSize: '14px', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#2a4060'; e.currentTarget.style.color = '#dde8f5'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#1b3149'; e.currentTarget.style.color = '#33526b'; }}
          >✕</button>
        </div>
      </div>

      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, #1b3149, transparent)', marginBottom: '16px' }} />

      {/* ── Counters ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        <Counter
          label="Adults"
          sublabel="Age 12 and above · full fare"
          value={adults}
          onChange={setAdults}
          min={1}
          accent="#38bdf8"
        />
        <Counter
          label="Children"
          sublabel="Age 2–12 · full fare, own seat"
          value={children}
          onChange={setChildren}
          accent="#f59e0b"
        />
        <Counter
          label="Infants"
          sublabel={`Under 2 yrs · flat ₹${INFANT_FLAT_RATE.toLocaleString('en-IN')}, lap seat`}
          value={infants}
          onChange={v => {
            // Infants must not exceed adults (lap policy)
            if (v <= adults) setInfants(v);
          }}
          accent="#a78bfa"
        />
      </div>

      {/* ── Breakdown + Total ── */}
      <div style={{
        background: '#0a1824', border: '1px solid #1b3149',
        borderRadius: '12px', padding: '16px 20px',
      }}>
        {/* Line items */}
        {[
          { label: `Adults × ${adults}`,   value: adultCost,  show: adults > 0,   color: '#38bdf8' },
          { label: `Children × ${children}`, value: childCost, show: children > 0, color: '#f59e0b' },
          { label: `Infants × ${infants} (flat)`, value: infantCost, show: infants > 0, color: '#a78bfa' },
        ].filter(r => r.show).map((row, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '8px',
          }}>
            <span style={{
              fontFamily: "'IBM Plex Mono',monospace", fontSize: '10px',
              color: '#33526b', letterSpacing: '.06em',
            }}>{row.label}</span>
            <span style={{
              fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px',
              color: row.color, fontWeight: 700,
            }}>{fmt(row.value)}</span>
          </div>
        ))}

        {/* Divider */}
        <div style={{ height: '1px', background: '#1b3149', margin: '10px 0' }} />

        {/* Total */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{
              fontFamily: "'IBM Plex Mono',monospace", fontSize: '10px',
              fontWeight: 700, color: '#6d8aaa', letterSpacing: '.12em',
              textTransform: 'uppercase',
            }}>Total · {totalPax} passenger{totalPax !== 1 ? 's' : ''}</span>
            {infants > 0 && (
              <div style={{
                fontFamily: "'IBM Plex Mono',monospace", fontSize: '8px',
                color: '#33526b', marginTop: '3px', letterSpacing: '.06em',
              }}>
                * Infant fare is indicative. Confirm with airline.
              </div>
            )}
          </div>
          <div style={{
            fontFamily: "'Playfair Display',serif", fontSize: '28px',
            fontWeight: 900, color: '#dde8f5',
          }}>
            {fmt(totalCost)}
          </div>
        </div>
      </div>

    </div>
  );
};

export default CostCalculator;