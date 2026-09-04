import { useState, useMemo } from 'react';

/* Shared geometry helpers ---------------------------------------------------*/
const niceTicks = (max, count = 5) => Array.from({ length: count + 1 }, (_, i) => (max / count) * i);

function pathFrom(points, smooth = true) {
  if (!points.length) return '';
  if (points.length < 3 || !smooth) {
    return points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
  }
  // Catmull-Rom → cubic bezier for a soft, premium curve.
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const t = 0.18;
    d += ` C${p1.x + (p2.x - p0.x) * t},${p1.y + (p2.y - p0.y) * t} ${p2.x - (p3.x - p1.x) * t},${p2.y - (p3.y - p1.y) * t} ${p2.x},${p2.y}`;
  }
  return d;
}

/* ------------------------------------------------------------- trend chart */

export function TrendChart({ data = [], maxPoint = 5, height = 280 }) {
  const [hover, setHover] = useState(null);
  const W = 760;
  const H = height;
  const pad = { t: 18, r: 18, b: 34, l: 38 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const geometry = useMemo(() => {
    if (data.length === 0) return null;
    const stepX = data.length === 1 ? 0 : iw / (data.length - 1);
    const y = (v) => pad.t + ih - (Math.max(0, Math.min(maxPoint, v)) / maxPoint) * ih;
    const x = (i) => pad.l + (data.length === 1 ? iw / 2 : i * stepX);
    return {
      gpa: data.map((d, i) => ({ x: x(i), y: y(d.gpa), d })),
      cgpa: data.map((d, i) => ({ x: x(i), y: y(d.cgpa), d })),
      x, y,
    };
  }, [data, iw, ih, maxPoint]);

  if (!geometry) {
    return <div className="empty" style={{ padding: 40 }}><p className="small">No semester data to plot yet.</p></div>;
  }

  const areaPath = `${pathFrom(geometry.gpa)} L${geometry.gpa.at(-1).x},${pad.t + ih} L${geometry.gpa[0].x},${pad.t + ih} Z`;
  const showEvery = Math.ceil(data.length / 8);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} style={{ display: 'block', overflow: 'visible' }}
           onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="gpaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gpaLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>

        {niceTicks(maxPoint, 5).map((t, i) => {
          const y = geometry.y(t);
          return (
            <g key={i}>
              <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="var(--grid-line)" strokeWidth="1" />
              <text x={pad.l - 9} y={y + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">{t.toFixed(1)}</text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#gpaFill)" />
        <path d={pathFrom(geometry.cgpa)} fill="none" stroke="var(--success)" strokeWidth="2"
              strokeDasharray="5 4" strokeLinecap="round" opacity="0.9" />
        <path d={pathFrom(geometry.gpa)} fill="none" stroke="url(#gpaLine)" strokeWidth="2.6" strokeLinecap="round" />

        {geometry.gpa.map((p, i) => (
          <g key={i}>
            {hover === i && <line x1={p.x} y1={pad.t} x2={p.x} y2={pad.t + ih} stroke="var(--border-strong)" strokeWidth="1" />}
            <circle cx={p.x} cy={geometry.cgpa[i].y} r={hover === i ? 4.5 : 3} fill="var(--panel)" stroke="var(--success)" strokeWidth="2" />
            <circle cx={p.x} cy={p.y} r={hover === i ? 5.5 : 3.8} fill="var(--panel)" stroke="var(--accent)" strokeWidth="2.4" />
            <rect x={p.x - (iw / data.length) / 2} y={pad.t} width={Math.max(iw / data.length, 18)} height={ih}
                  fill="transparent" onMouseEnter={() => setHover(i)} style={{ cursor: 'pointer' }} />
            {i % showEvery === 0 && (
              <text x={p.x} y={H - 12} textAnchor="middle" fontSize="10" fill="var(--muted)">{p.d.shortLabel || p.d.label}</text>
            )}
          </g>
        ))}
      </svg>

      {hover != null && (
        <div className="chart-tip" style={{
          left: `${(geometry.gpa[hover].x / W) * 100}%`,
          top: `${(geometry.gpa[hover].y / H) * 100}%`,
          opacity: 1,
        }}>
          <div style={{ fontWeight: 650, marginBottom: 3 }}>{data[hover].label}</div>
          <div style={{ color: 'var(--accent)' }}>GPA {data[hover].gpa.toFixed(2)}</div>
          <div style={{ color: 'var(--success)' }}>CGPA {data[hover].cgpa.toFixed(2)}</div>
          <div className="muted" style={{ fontSize: '.72rem' }}>{data[hover].units} units</div>
        </div>
      )}

      <div className="chart-legend">
        <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--accent)' }} /> Semester GPA</span>
        <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--success)' }} /> Cumulative CGPA</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- bar chart */

export function BarChart({ data = [], max, height = 220, format = (v) => v.toFixed(2), colorFor }) {
  const [hover, setHover] = useState(null);
  const W = 760;
  const H = height;
  const pad = { t: 16, r: 14, b: 34, l: 38 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const peak = max ?? Math.max(1, ...data.map((d) => d.value));

  if (!data.length) return <div className="empty" style={{ padding: 34 }}><p className="small">Nothing to chart yet.</p></div>;

  const slot = iw / data.length;
  const bw = Math.min(46, slot * 0.62);

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} style={{ display: 'block' }} onMouseLeave={() => setHover(null)}>
        {niceTicks(peak, 4).map((t, i) => {
          const y = pad.t + ih - (t / peak) * ih;
          return (
            <g key={i}>
              <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="var(--grid-line)" />
              <text x={pad.l - 9} y={y + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / peak) * ih);
          const x = pad.l + i * slot + (slot - bw) / 2;
          const y = pad.t + ih - h;
          const fill = colorFor ? colorFor(d) : 'url(#barGrad)';
          return (
            <g key={i} onMouseEnter={() => setHover(i)} style={{ cursor: 'pointer' }}>
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" />
                  <stop offset="100%" stopColor="var(--accent-2)" stopOpacity=".55" />
                </linearGradient>
              </defs>
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill="transparent" />
              <rect x={x} y={y} width={bw} height={h} rx="5" fill={fill}
                    opacity={hover == null || hover === i ? 1 : 0.45} style={{ transition: 'opacity .15s' }} />
              <text x={x + bw / 2} y={H - 12} textAnchor="middle" fontSize="9.5" fill="var(--muted)">{d.shortLabel || d.label}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{
          left: `${((pad.l + hover * slot + slot / 2) / W) * 100}%`,
          top: `${((pad.t + ih - (data[hover].value / peak) * ih) / H) * 100}%`,
        }}>
          <div style={{ fontWeight: 650 }}>{data[hover].label}</div>
          <div className="muted">{format(data[hover].value)}</div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- donut chart */

const PALETTE = ['#34D399', '#7C8CFF', '#A78BFA', '#FBBF24', '#FB923C', '#FB7185', '#94A3B8'];

export function DonutChart({ data = [], size = 190, thickness = 22, centerLabel, centerValue }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const [hover, setHover] = useState(null);
  if (!total) return <div className="empty" style={{ padding: 30 }}><p className="small">No graded courses yet.</p></div>;

  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex" style={{ gap: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * c;
            const el = (
              <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
                      stroke={d.color || PALETTE[i % PALETTE.length]}
                      strokeWidth={hover === i ? thickness + 4 : thickness}
                      strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset}
                      strokeLinecap="butt" opacity={hover == null || hover === i ? 1 : 0.4}
                      onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                      style={{ transition: 'stroke-width .15s, opacity .15s', cursor: 'pointer' }} />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 720, letterSpacing: '-.03em' }}>
              {hover != null ? data[hover].value : centerValue ?? total}
            </div>
            <div className="muted" style={{ fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.07em' }}>
              {hover != null ? data[hover].label : centerLabel || 'total'}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 7, alignContent: 'center' }}>
        {data.map((d, i) => (
          <div key={i} className="legend-item" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
               style={{ cursor: 'pointer', fontSize: '.82rem' }}>
            <span className="legend-swatch" style={{ background: d.color || PALETTE[i % PALETTE.length] }} />
            <span style={{ color: 'var(--text-2)' }}>{d.label}</span>
            <span className="muted tabular">· {d.value} ({Math.round((d.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- radial gauge */

export function Gauge({ value = 0, max = 5, size = 168, label = 'CGPA', tone = 'accent' }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const stroke = 13;
  const r = size / 2 - stroke;
  const circumference = Math.PI * r; // half circle
  const colors = {
    accent: ['var(--accent)', 'var(--accent-2)'],
    success: ['var(--success)', 'var(--accent)'],
    warn: ['var(--warn)', 'var(--danger)'],
  }[tone] || ['var(--accent)', 'var(--accent-2)'];

  return (
    <div style={{ width: size, textAlign: 'center' }}>
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
        <defs>
          <linearGradient id={`g-${tone}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={colors[0]} />
            <stop offset="100%" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        <path d={`M ${stroke} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke} ${size / 2}`}
              fill="none" stroke="var(--grid-line)" strokeWidth={stroke} strokeLinecap="round" />
        <path d={`M ${stroke} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke} ${size / 2}`}
              fill="none" stroke={`url(#g-${tone})`} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${pct * circumference} ${circumference}`}
              style={{ transition: 'stroke-dasharray .6s cubic-bezier(.4,0,.2,1)' }} />
        <text x={size / 2} y={size / 2 - 8} textAnchor="middle" fontSize="26" fontWeight="720"
              fill="var(--text)" style={{ letterSpacing: '-.03em' }}>{value.toFixed(2)}</text>
        <text x={size / 2} y={size / 2 + 9} textAnchor="middle" fontSize="10" fill="var(--muted)">
          {label} · max {max.toFixed(1)}
        </text>
      </svg>
    </div>
  );
}

/* --------------------------------------------------------- horizontal bars */

export function ImpactBars({ items = [], height = 20 }) {
  const peak = Math.max(...items.map((i) => Math.abs(i.impact)), 1);
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {items.map((it) => {
        const w = (Math.abs(it.impact) / peak) * 100;
        const neg = it.impact < 0;
        return (
          <div key={it.id} className="flex" style={{ gap: 10 }}>
            <div className="code-cell" style={{ width: 78, flexShrink: 0 }}>{it.code}</div>
            <div style={{ flex: 1, position: 'relative', height, background: 'var(--panel-2)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: 0, width: `${w}%`,
                background: neg
                  ? 'linear-gradient(90deg, var(--danger), color-mix(in srgb, var(--danger) 45%, transparent))'
                  : 'linear-gradient(90deg, var(--success), color-mix(in srgb, var(--success) 45%, transparent))',
                borderRadius: 6, transition: 'width .5s',
              }} />
            </div>
            <div className="tabular small" style={{ width: 92, textAlign: 'right', color: neg ? 'var(--danger)' : 'var(--success)', fontWeight: 620 }}>
              {it.impact > 0 ? '+' : ''}{it.impact.toFixed(2)} QP
            </div>
            <div style={{ width: 54, textAlign: 'right' }} className="small muted">{it.unit}u · {it.grade}</div>
          </div>
        );
      })}
    </div>
  );
}
