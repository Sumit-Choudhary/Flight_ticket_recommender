import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

/**
 * FlightChatbot
 *
 * Props:
 *   flights     — current all_options array from the search response
 *   originCity  — e.g. "Pune"
 *   destName    — e.g. "Kolkata"
 *   isSearching — true while a search is in progress (disables chat)
 */
const FlightChatbot = ({ flights = [], originCity = "", destName = "", isSearching = false }) => {
  const [history,  setHistory]  = useState([]);   // [{role, text}]
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [expanded, setExpanded] = useState(true);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  const hasFlights = flights.length > 0;

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, loading]);

  // Reset chat when a new search fires
  useEffect(() => {
    if (isSearching) {
      setHistory([]);
      setInput("");
    }
  }, [isSearching]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading || !hasFlights) return;

    const userTurn = { role: 'user', text };
    const newHistory = [...history, userTurn];
    setHistory(newHistory);
    setInput("");
    setLoading(true);

    try {
      const res = await axios.post('http://127.0.0.1:8000/chat', {
        message:     text,
        history:     history,          // send history BEFORE this turn
        flights:     flights,
        origin_city: originCity,
        dest_name:   destName,
      });
      setHistory([...newHistory, { role: 'model', text: res.data.reply }]);
    } catch {
      setHistory([...newHistory, {
        role: 'model',
        text: "Sorry, I couldn't reach the server. Please try again.",
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Render model message with basic markdown
  const renderText = (text) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      const formatted = line
        .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#dde8f5">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em style="color:#6d8aaa">$1</em>');
      return (
        <span key={i}>
          <span dangerouslySetInnerHTML={{ __html: formatted }} />
          {i < lines.length - 1 && <br />}
        </span>
      );
    });
  };

  // Suggested starter questions — cleared after first message
  const suggestions = [
    "Which is the cheapest flight?",
    "Is it worth flying via a nearby airport?",
    "Which airline is fastest?",
    "What's the best value for money?",
  ];

  return (
    <div style={{
      background: 'linear-gradient(145deg, #0c1929 0%, #07111c 100%)',
      border: '1px solid #1b3149',
      borderRadius: '16px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      marginBottom: '16px',
    }}>

      {/* ── Header ── */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', cursor: 'pointer',
          borderBottom: expanded ? '1px solid #1b3149' : 'none',
          transition: 'border .2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: hasFlights ? 'linear-gradient(135deg, #0a3550, #38bdf8)' : '#1b3149',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', transition: 'background .3s',
          }}>💬</div>
          <div>
            <div style={{
              fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px',
              fontWeight: 700, color: '#dde8f5', letterSpacing: '.06em',
            }}>Flight Assistant</div>
            <div style={{
              fontFamily: "'IBM Plex Mono',monospace", fontSize: '9px',
              color: hasFlights ? '#38bdf8' : '#33526b', letterSpacing: '.12em',
              textTransform: 'uppercase', marginTop: '1px',
            }}>
              {isSearching ? 'SCANNING...' : hasFlights ? `${originCity} → ${destName}` : 'NO DATA YET'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {history.length > 0 && (
            <span style={{
              fontFamily: "'IBM Plex Mono',monospace", fontSize: '9px',
              color: '#33526b', background: '#1b3149',
              padding: '2px 7px', borderRadius: '20px',
            }}>{history.length / 2 | 0} Q</span>
          )}
          <span style={{
            color: '#33526b', fontSize: '12px',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform .2s', display: 'inline-block',
          }}>▼</span>
        </div>
      </div>

      {/* ── Body — collapsible ── */}
      {expanded && (
        <>
          {/* Messages area */}
          <div style={{
            height: '280px', overflowY: 'auto', overflowX: 'hidden',
            padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px',
          }}>

            {/* Empty state */}
            {!hasFlights && (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}>
                <span style={{ fontSize: '28px', opacity: .3 }}>✈️</span>
                <span style={{
                  fontFamily: "'IBM Plex Mono',monospace", fontSize: '10px',
                  color: '#33526b', textAlign: 'center', lineHeight: 1.6,
                }}>
                  Run a search first.<br />I'll answer questions<br />about the results.
                </span>
              </div>
            )}

            {/* Welcome + suggestions on first load */}
            {hasFlights && history.length === 0 && (
              <>
                <div style={{
                  alignSelf: 'flex-start', maxWidth: '90%',
                  background: '#101f30', borderRadius: '0 10px 10px 10px',
                  padding: '10px 13px', border: '1px solid #1b3149',
                }}>
                  <p style={{
                    fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px',
                    color: '#6d8aaa', lineHeight: 1.6, margin: 0,
                  }}>
                    I have <strong style={{ color: '#38bdf8' }}>{flights.length} flights</strong> loaded
                    for <strong style={{ color: '#dde8f5' }}>{originCity} → {destName}</strong>.
                    Ask me anything about these results.
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      style={{
                        fontFamily: "'IBM Plex Mono',monospace", fontSize: '9px',
                        color: '#38bdf8', background: 'rgba(56,189,248,0.07)',
                        border: '1px solid rgba(56,189,248,0.2)',
                        borderRadius: '20px', padding: '4px 10px', cursor: 'pointer',
                        transition: 'all .15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(56,189,248,0.15)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(56,189,248,0.07)'; }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Conversation turns */}
            {history.map((turn, i) => {
              const isUser = turn.role === 'user';
              return (
                <div key={i} style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  background: isUser ? 'rgba(245,158,11,0.1)' : '#101f30',
                  border: `1px solid ${isUser ? 'rgba(245,158,11,0.25)' : '#1b3149'}`,
                  borderRadius: isUser ? '10px 10px 0 10px' : '0 10px 10px 10px',
                  padding: '9px 12px',
                }}>
                  <p style={{
                    fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px',
                    color: isUser ? '#f59e0b' : '#6d8aaa',
                    lineHeight: 1.6, margin: 0,
                  }}>
                    {isUser ? turn.text : renderText(turn.text)}
                  </p>
                </div>
              );
            })}

            {/* Typing indicator */}
            {loading && (
              <div style={{
                alignSelf: 'flex-start',
                background: '#101f30', border: '1px solid #1b3149',
                borderRadius: '0 10px 10px 10px', padding: '10px 14px',
                display: 'flex', gap: '5px', alignItems: 'center',
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: '5px', height: '5px', borderRadius: '50%',
                    background: '#38bdf8',
                    animation: `ctapulse 1s ${i * 0.2}s ease-in-out infinite`,
                  }} />
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input bar ── */}
          <div style={{
            borderTop: '1px solid #1b3149', padding: '10px 12px',
            display: 'flex', gap: '8px', alignItems: 'center',
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!hasFlights || loading || isSearching}
              placeholder={hasFlights ? "Ask about these flights..." : "Search first to enable chat"}
              style={{
                flex: 1,
                background: '#101f30', border: '1px solid #1b3149',
                borderRadius: '8px', padding: '8px 12px',
                color: '#dde8f5', fontFamily: "'IBM Plex Mono',monospace",
                fontSize: '11px', outline: 'none',
                opacity: hasFlights ? 1 : 0.4,
                transition: 'border-color .2s',
              }}
              onFocus={e => { e.target.style.borderColor = '#38bdf8'; }}
              onBlur={e => { e.target.style.borderColor = '#1b3149'; }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading || !hasFlights}
              style={{
                width: '34px', height: '34px', borderRadius: '8px', border: 'none',
                background: input.trim() && hasFlights ? 'var(--amber)' : '#1b3149',
                color: input.trim() && hasFlights ? '#000' : '#33526b',
                fontSize: '14px', cursor: input.trim() && hasFlights ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .15s', flexShrink: 0,
              }}
            >
              ▶
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default FlightChatbot;