import React, { useState, useEffect } from 'react';

/**
 * Converts Gemini markdown to inline HTML.
 * Handles **bold**, *italic*, ## headers, and bullet lines.
 */
const renderInsightText = (text) => {
  if (!text) return null;

  const lines = text.split('\n');
  return lines.map((line, i) => {
    // ## Header line
    if (line.startsWith('## ')) {
      const headingText = line.slice(3)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      return (
        <div key={i} style={{
          fontFamily:"'IBM Plex Mono',monospace", fontSize:'10px',
          fontWeight:700, letterSpacing:'.15em', textTransform:'uppercase',
          color:'#38bdf8', marginTop: i === 0 ? 0 : '16px', marginBottom:'6px',
        }}
        dangerouslySetInnerHTML={{ __html: headingText }} />
      );
    }

    // Bullet line
    if (line.startsWith('- ') || line.startsWith('• ')) {
      const bulletText = line.slice(2)
        .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#dde8f5">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em style="color:#6d8aaa">$1</em>');
      return (
        <div key={i} style={{
          display:'flex', gap:'8px', marginBottom:'6px',
          fontFamily:"'IBM Plex Mono',monospace", fontSize:'11px',
          color:'#6d8aaa', lineHeight:1.6,
        }}>
          <span style={{ color:'#38bdf8', flexShrink:0, marginTop:'1px' }}>›</span>
          <span dangerouslySetInnerHTML={{ __html: bulletText }} />
        </div>
      );
    }

    // Empty line — spacer
    if (!line.trim()) return <div key={i} style={{ height:'6px' }} />;

    // Normal paragraph line
    const formatted = line
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#dde8f5">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em style="color:#6d8aaa">$1</em>');
    return (
      <div key={i} style={{
        fontFamily:"'IBM Plex Mono',monospace", fontSize:'11px',
        color:'#6d8aaa', lineHeight:1.7, marginBottom:'4px',
      }}
      dangerouslySetInnerHTML={{ __html: formatted }} />
    );
  });
};

const InsightSidebar = ({ insight }) => {
  const [opacity, setOpacity]       = useState(0);
  const [translateY, setTranslateY] = useState(12);

  useEffect(() => {
    // Reset to hidden on every insight change — including when set to null.
    // This ensures the old content visibly disappears before new content fades in.
    setOpacity(0);
    setTranslateY(12);

    if (insight) {
      // Small delay so the reset (above) renders first, then fade in
      const t = setTimeout(() => {
        setOpacity(1);
        setTranslateY(0);
      }, 120);
      return () => clearTimeout(t);
    }
  }, [insight]);

  const isLoading = !insight;

  return (
    <div style={{
      background:'linear-gradient(145deg, #0c1929 0%, #07111c 100%)',
      border:'1px solid #1b3149',
      borderRadius:'16px', padding:'24px',
      height:'100%',              /* fill the wrapper div from NavigatorUI */
      display:'flex',
      flexDirection:'column',     /* header + divider fixed, content scrolls */
      boxShadow:'0 0 24px rgba(56,189,248,0.05)',
      minHeight:'200px',
    }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'20px' }}>
        <div style={{ position:'relative', flexShrink:0 }}>
          <div style={{
            width:'40px', height:'40px', borderRadius:'50%',
            background: isLoading
              ? 'linear-gradient(135deg, #0a3550, #1b3149)'
              : 'linear-gradient(135deg, #0a3550, #38bdf8)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'20px',
            animation: isLoading ? 'ctapulse 1.5s ease-in-out infinite' : 'none',
          }}>
            🤖
          </div>
          <div style={{
            position:'absolute', inset:0, borderRadius:'50%',
            background:'rgba(56,189,248,0.15)', filter:'blur(8px)',
            opacity: isLoading ? 0 : 1, transition:'opacity .4s',
          }} />
        </div>
        <div>
          <div style={{
            fontFamily:"'Playfair Display',serif", fontSize:'15px',
            fontWeight:700, color:'#dde8f5',
          }}>Gemini Insight</div>
          <div style={{
            fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
            color:'#38bdf8', letterSpacing:'.2em', textTransform:'uppercase',
            marginTop:'2px',
          }}>Route Optimizer</div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="glow-rule" style={{ marginBottom:'20px' }} />

      {/* ── Content — scrollable, fills remaining height ── */}
      <div style={{
        opacity, transform:`translateY(${translateY}px)`,
        transition:'opacity .4s ease, transform .4s ease',
        flex:1,                 /* grow to fill space between header and footer */
        overflowY:'auto',       /* scroll just this region */
        overflowX:'hidden',
        paddingRight:'4px',     /* breathing room for scrollbar */
        minHeight:0,            /* flex child needs this to allow shrinking */
      }}>
        {isLoading ? (
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {/* Skeleton lines while waiting */}
            {[100, 85, 92, 70].map((w, i) => (
              <div key={i} style={{
                height:'10px', borderRadius:'4px',
                background:'linear-gradient(90deg, #1b3149 0%, #0a3550 50%, #1b3149 100%)',
                backgroundSize:'200% 100%',
                width:`${w}%`,
                animation:'shimmer 1.8s ease-in-out infinite',
                animationDelay:`${i * 0.15}s`,
              }} />
            ))}
            <style>{`
              @keyframes shimmer {
                0%   { background-position: 200% 0; }
                100% { background-position: -200% 0; }
              }
            `}</style>
          </div>
        ) : (
          <div style={{
            borderLeft:'2px solid rgba(56,189,248,0.3)',
            paddingLeft:'14px',
          }}>
            {renderInsightText(insight)}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        marginTop:'20px', paddingTop:'14px',
        borderTop:'1px solid #1b3149',
        display:'flex', justifyContent:'space-between', alignItems:'center',
      }}>
        <span style={{
          fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px',
          color:'#33526b', letterSpacing:'.12em',
        }}>MODEL: GEMINI-2.5-FLASH</span>
        <div style={{ display:'flex', gap:'4px' }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width:'4px', height:'4px', borderRadius:'50%',
              background: isLoading ? '#f59e0b' : '#1b3149',
              animation: isLoading ? `ctapulse 1.2s ${i*0.3}s ease-in-out infinite` : 'none',
            }} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default InsightSidebar;