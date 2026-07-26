/**
 * GroupLandingPage — Public group / umbrella marketing page at /group
 *
 * Modelled on the Measured Markets site layout:
 *   • Dark hero with headline + stat strip
 *   • "Three Verticals" product cards — middle card is the SBDMM Furniture Platform
 *   • Scan → Engine → Assemble process strip
 *   • Technology / Unfair-Advantage section
 *   • Five-Sided Ecosystem section
 *   • Investment Highlights CTA banner
 *   • Five-column footer
 *
 * Pure Bootstrap 5 + Phosphor icons (already bundled).
 * No external runtime dependencies added.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// ─── Data ─────────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: 'Products',   href: '#products' },
  { label: 'How It Works', href: '#process' },
  { label: 'Technology', href: '#technology' },
  { label: 'Platform',   href: '#ecosystem' },
  { label: 'Investors',  href: '#investment' },
];

const STATS = [
  { value: '$1.2T', label: 'Total Addressable Market' },
  { value: '< 2.5%', label: 'Material Waste' },
  { value: '48 h', label: 'Global Delivery Benchmark' },
  { value: '1,280+', label: 'Pre-registered Micro-Factories' },
];

interface Vertical {
  icon: string;
  title: string;
  range: string;
  desc: string;
  cta?: string;
  ctaTo?: string;
  highlight?: boolean;
  imageGradient: string;
}

const VERTICALS: Vertical[] = [
  {
    icon: 'ph-t-shirt',
    title: 'Apparel',
    range: '$18 – $500',
    desc: 'Shirts, trousers, suits, jackets, and overcoats. Bespoke fit using recycled PET or premium wool.',
    imageGradient: 'linear-gradient(135deg,#e8f5e9 0%,#a5d6a7 100%)',
  },
  {
    icon: 'ph-armchair',
    title: 'SBDMM — Furniture Platform',
    range: '$200 – $12,000',
    desc: 'AI-designed bespoke furniture — tables, chairs, sofas, and cabinetry — matched to a verified local carpenter and delivered in 48 h. Upload your room photo, set your preferences, and receive three tailored concepts powered by GPT-4o Vision.',
    cta: 'Launch Platform →',
    ctaTo: '/login',
    highlight: true,
    imageGradient: 'linear-gradient(135deg,#e3f2fd 0%,#90caf9 100%)',
  },
  {
    icon: 'ph-house-line',
    title: 'Flat-Pack Housing',
    range: '$5,000 – $50,000',
    desc: 'UHPC concrete panels + steel skeleton. Assemble in 1 day with AR guidance. No welding required.',
    imageGradient: 'linear-gradient(135deg,#fff8e1 0%,#ffe082 100%)',
  },
];

const PROCESS_STEPS = [
  {
    num: '1',
    icon: 'ph-scan',
    title: 'Scan',
    desc: 'Use your iPhone Pro or Android depth camera. A 30-second video captures 25,000 precision points.',
  },
  {
    num: '2',
    icon: 'ph-cpu',
    title: 'LBPG Engine',
    desc: 'AI optimises a 2D lattice pattern. Reduces scrap to < 2.5 %. Generates G-code in under 1.2 seconds.',
  },
  {
    num: '3',
    icon: 'ph-hammer',
    title: 'Assemble',
    desc: 'Markerless AR projects instructions onto your workspace. Built-in safety lock prevents errors.',
  },
];

const TECH_ADVANTAGES = [
  { icon: 'ph-lock-key', text: 'Patent #CDRTEX-2026-001A — AR Dynamic Tolerance Allocation & Safety Lock.' },
  { icon: 'ph-brain',    text: 'Semantic Segmentation — ResNet-101 distinguishes rigid (steel) from flexible (fabric) zones.' },
  { icon: 'ph-lightning', text: 'Real-Time Optimisation — 145 iterations in 1/5 seconds on-device.' },
  { icon: 'ph-shield-check', text: 'Safety Lock — Accelerometer halts assembly if tilt > 1.8°.' },
];

const ECOSYSTEM_NODES = [
  { icon: 'ph-users', label: 'Consumers',          desc: 'Bespoke fit at mass-market prices.' },
  { icon: 'ph-factory', label: 'Micro-Factories',  desc: 'Global demand; pre-optimised G-code.' },
  { icon: 'ph-truck', label: 'Logistics',           desc: 'Route optimisation. Last-mile < $3.' },
  { icon: 'ph-package', label: 'Material Suppliers',desc: 'Bulk predictable orders. UHPC, steel, textiles.' },
  { icon: 'ph-palette', label: 'Designers',         desc: 'Royalties on generative AI designs.' },
];

const INVEST_STATS = [
  { value: '$28M',  label: 'Total Raise (Seed + Series A)' },
  { value: '72%',   label: 'Projected IRR (Base)' },
  { value: '14.4x', label: 'Projected Cash by Year 10' },
  { value: '1,280+', label: 'Pre-registered Micro-Factories' },
];

// ─── Nav ──────────────────────────────────────────────────────────────────────

function GroupNav({ scrolled }: { scrolled: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        background: scrolled ? 'rgba(255,255,255,0.97)' : '#fff',
        boxShadow: scrolled ? '0 2px 20px rgba(0,0,0,0.09)' : '0 1px 0 #f1f5f9',
        backdropFilter: 'blur(8px)',
        transition: 'box-shadow 0.2s',
      }}
    >
      <div className="container">
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', gap: 16 }}>
          {/* Logo */}
          <a href="/group" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span
              style={{
                width: 36, height: 36, borderRadius: 10, background: '#0f172a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 15, letterSpacing: '-0.03em',
              }}
            >
              MM
            </span>
            <span style={{ fontWeight: 700, fontSize: 17, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Measured Markets
            </span>
          </a>

          {/* Desktop links */}
          <div className="d-none d-lg-flex align-items-center" style={{ gap: 28 }}>
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                style={{ fontSize: 14, fontWeight: 500, color: '#475569', textDecoration: 'none', transition: 'color 0.15s' }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#0f172a')}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = '#475569')}
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* CTAs + hamburger */}
          <div className="d-flex align-items-center" style={{ gap: 8 }}>
            <Link
              to="/login"
              style={{
                fontSize: 13, fontWeight: 600, color: '#fff', textDecoration: 'none',
                padding: '8px 18px', borderRadius: 8, background: '#0f172a', whiteSpace: 'nowrap',
              }}
            >
              Start Your Scan
            </Link>
            <button
              className="d-flex d-lg-none align-items-center justify-content-center"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle navigation"
              style={{
                width: 38, height: 38, borderRadius: 8, border: '1px solid #e2e8f0',
                background: menuOpen ? '#f1f5f9' : '#fff', cursor: 'pointer', color: '#1e293b', fontSize: 20,
              }}
            >
              <i className={`ph ${menuOpen ? 'ph-x' : 'ph-list'}`} />
            </button>
          </div>
        </nav>

        {menuOpen && (
          <div className="d-lg-none" style={{ borderTop: '1px solid #f1f5f9', paddingBottom: 12 }}>
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '10px 4px', fontSize: 15, fontWeight: 500, color: '#475569', textDecoration: 'none', borderBottom: '1px solid #f8fafc' }}
              >
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GroupLandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", color: '#1e293b', overflowX: 'hidden' }}>
      {/* Top info bar */}
      <div style={{ background: '#0f172a', color: '#94a3b8', fontSize: 12, padding: '7px 0' }}>
        <div className="container d-flex justify-content-between align-items-center flex-wrap" style={{ gap: 8 }}>
          <span className="d-none d-sm-flex align-items-center" style={{ gap: 6 }}>
            <i className="ph ph-phone" style={{ color: '#38bdf8' }} />
            +1 (800) 123-4567
            <span style={{ margin: '0 10px', opacity: 0.3 }}>|</span>
            <i className="ph ph-envelope" style={{ color: '#38bdf8' }} />
            hello@measuredmarkets.com
          </span>
          <span className="d-flex d-sm-none" style={{ color: '#64748b', fontSize: 11 }}>
            Bespoke for Everyone. Precision at Scale.
          </span>
          <span className="d-flex align-items-center" style={{ gap: 12 }}>
            {['ph-linkedin-logo', 'ph-twitter-logo', 'ph-facebook-logo'].map((ic) => (
              <a key={ic} href="#" style={{ color: '#64748b' }} aria-label={ic}>
                <i className={`ph ${ic}`} />
              </a>
            ))}
          </span>
        </div>
      </div>

      <GroupNav scrolled={scrolled} />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        style={{
          background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 60%, #0c4a6e 100%)',
          padding: '80px 0 0',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', top: -100, right: -120, width: 500, height: 500, background: 'rgba(56,189,248,0.06)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 60, left: -80, width: 360, height: 360, background: 'rgba(14,165,233,0.04)', borderRadius: '50%', pointerEvents: 'none' }} />

        <div className="container" style={{ position: 'relative' }}>
          <div className="row align-items-center" style={{ rowGap: 40 }}>

            {/* Copy */}
            <div className="col-12 col-lg-6">
              <h1
                style={{
                  fontSize: 'clamp(2.2rem, 5.5vw, 3.75rem)',
                  fontWeight: 900,
                  color: '#fff',
                  lineHeight: 1.1,
                  marginBottom: 20,
                  letterSpacing: '-0.03em',
                }}
              >
                Bespoke for Everyone.{' '}
                <span style={{ color: '#38bdf8' }}>Precision at Scale.</span>
              </h1>

              <p style={{ fontSize: 16, color: '#94a3b8', lineHeight: 1.75, marginBottom: 36, maxWidth: 480 }}>
                Turn your smartphone into a precision 3D scanner. Get custom-fit
                apparel, AI-designed furniture, and flat-pack housing delivered in
                48 hours — at mass-market prices.
              </p>

              <div className="d-flex flex-wrap" style={{ gap: 12 }}>
                <a
                  href="#products"
                  style={{
                    background: '#38bdf8',
                    color: '#0f172a',
                    fontWeight: 700,
                    fontSize: 15,
                    padding: '13px 26px',
                    borderRadius: 10,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  Explore Products
                </a>
                <a
                  href="#process"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    color: '#e2e8f0',
                    fontWeight: 600,
                    fontSize: 15,
                    padding: '13px 26px',
                    borderRadius: 10,
                    textDecoration: 'none',
                    border: '1px solid rgba(255,255,255,0.12)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  How It Works
                </a>
              </div>
            </div>

            {/* Phone/scanner mockup */}
            <div className="col-lg-6 d-none d-lg-flex justify-content-center">
              <div
                style={{
                  width: 240,
                  height: 420,
                  background: '#1e293b',
                  border: '2px solid rgba(56,189,248,0.25)',
                  borderRadius: 36,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 16,
                  boxShadow: '0 0 80px rgba(56,189,248,0.15)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Scan crosshair animation */}
                <div
                  style={{
                    width: 140,
                    height: 140,
                    border: '2px solid rgba(56,189,248,0.5)',
                    borderRadius: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  {/* Corner brackets */}
                  {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos, i) => (
                    <div key={i} style={{ position: 'absolute', ...pos, width: 18, height: 18, borderColor: '#38bdf8', borderStyle: 'solid', borderWidth: i === 0 ? '2px 0 0 2px' : i === 1 ? '2px 2px 0 0' : i === 2 ? '0 0 2px 2px' : '0 2px 2px 0' }} />
                  ))}
                  <i className="ph ph-scan" style={{ fontSize: 40, color: '#38bdf8', opacity: 0.7 }} />
                </div>
                <span style={{ color: '#38bdf8', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em' }}>SCANNING…</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1,2,3,4,5].map(n => (
                    <div key={n} style={{ width: 6, height: 6, borderRadius: '50%', background: n <= 3 ? '#38bdf8' : 'rgba(56,189,248,0.2)' }} />
                  ))}
                </div>
                <span style={{ color: '#475569', fontSize: 11 }}>25,000 points captured</span>
                {/* Decorative gradient at bottom */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, background: 'linear-gradient(transparent,rgba(56,189,248,0.05))' }} />
              </div>
            </div>

          </div>
        </div>

        {/* Stats strip integrated in hero bottom */}
        <div style={{ marginTop: 64, borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.2)' }}>
          <div className="container">
            <div className="row text-center" style={{ padding: '24px 0' }}>
              {STATS.map((s) => (
                <div key={s.label} className="col-6 col-md-3" style={{ padding: '12px 0', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 800, color: '#38bdf8' }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PRODUCTS ──────────────────────────────────────────────────────── */}
      <section id="products" style={{ padding: '80px 0', background: '#fff' }}>
        <div className="container">
          <div className="text-center" style={{ marginBottom: 56 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Products
            </span>
            <h2 style={{ fontSize: 'clamp(1.6rem,3.5vw,2.5rem)', fontWeight: 800, color: '#0f172a', marginTop: 8, letterSpacing: '-0.02em' }}>
              Three Verticals. Infinite Customisation.
            </h2>
            <p style={{ fontSize: 15, color: '#64748b', maxWidth: 520, margin: '12px auto 0' }}>
              From a $10 shirt to a $50,000 flat-pack home — powered by the same LBPG engine.
            </p>
          </div>

          <div className="row g-4 justify-content-center">
            {VERTICALS.map((v) => (
              <div key={v.title} className="col-12 col-md-6 col-lg-4">
                <div
                  style={{
                    border: v.highlight ? '2px solid #38bdf8' : '1px solid #e2e8f0',
                    borderRadius: 20,
                    overflow: 'hidden',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: v.highlight ? '0 8px 40px rgba(56,189,248,0.15)' : '0 2px 12px rgba(0,0,0,0.05)',
                    transition: 'box-shadow 0.2s, transform 0.2s',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 16px 48px rgba(0,0,0,0.12)';
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = v.highlight ? '0 8px 40px rgba(56,189,248,0.15)' : '0 2px 12px rgba(0,0,0,0.05)';
                    (e.currentTarget as HTMLDivElement).style.transform = '';
                  }}
                >
                  {/* Badge for platform card */}
                  {v.highlight && (
                    <div style={{
                      position: 'absolute', top: 16, right: 16,
                      background: '#38bdf8', color: '#0f172a',
                      fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '3px 10px',
                      letterSpacing: '0.05em', textTransform: 'uppercase',
                    }}>
                      Live Platform
                    </div>
                  )}

                  {/* Image */}
                  <div
                    style={{
                      height: 200,
                      background: v.imageGradient,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <i className={`ph ${v.icon}`} style={{ fontSize: 64, color: 'rgba(0,0,0,0.18)' }} />
                  </div>

                  {/* Content */}
                  <div style={{ padding: '24px 24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <h3 style={{ fontSize: 19, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>
                      {v.title}
                    </h3>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8' }}>{v.range}</div>
                    <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.65, margin: 0, flex: 1 }}>{v.desc}</p>

                    {v.cta && v.ctaTo && (
                      <Link
                        to={v.ctaTo}
                        style={{
                          marginTop: 8,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: '#0f172a',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: 14,
                          padding: '10px 20px',
                          borderRadius: 10,
                          textDecoration: 'none',
                          alignSelf: 'flex-start',
                        }}
                      >
                        <i className="ph ph-arrow-square-out" /> {v.cta}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROCESS ────────────────────────────────────────────────────────── */}
      <section id="process" style={{ padding: '80px 0', background: '#f8fafc' }}>
        <div className="container">
          <div className="text-center" style={{ marginBottom: 56 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Process
            </span>
            <h2 style={{ fontSize: 'clamp(1.6rem,3.5vw,2.5rem)', fontWeight: 800, color: '#0f172a', marginTop: 8 }}>
              Scan. Generate. Assemble.
            </h2>
            <p style={{ fontSize: 15, color: '#64748b', maxWidth: 420, margin: '12px auto 0' }}>
              Three simple steps. Zero expertise required.
            </p>
          </div>

          <div className="row g-4 justify-content-center">
            {PROCESS_STEPS.map((s, i) => (
              <div key={s.title} className="col-12 col-sm-6 col-md-4">
                <div
                  style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 20,
                    padding: '36px 28px',
                    textAlign: 'center',
                    height: '100%',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: 52, height: 52, borderRadius: '50%',
                      background: '#0f172a',
                      color: '#38bdf8', fontWeight: 900, fontSize: 20,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 20px',
                    }}
                  >
                    {i + 1}
                  </div>
                  <i className={`ph ${s.icon}`} style={{ fontSize: 36, color: '#38bdf8', marginBottom: 14, display: 'block' }} />
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>{s.title}</h3>
                  <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65, margin: 0 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TECHNOLOGY ─────────────────────────────────────────────────────── */}
      <section id="technology" style={{ padding: '80px 0', background: '#0f172a' }}>
        <div className="container">
          <div className="text-center" style={{ marginBottom: 56 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Technology
            </span>
            <h2 style={{ fontSize: 'clamp(1.6rem,3.5vw,2.5rem)', fontWeight: 800, color: '#fff', marginTop: 8 }}>
              The LBPG Engine
            </h2>
            <p style={{ fontSize: 15, color: '#64748b', maxWidth: 540, margin: '12px auto 0' }}>
              Lattice-Based Pattern Generation — proprietary AI that turns 3D scans into flawless 2D cuts.
            </p>
          </div>

          <div className="row align-items-center g-5">
            {/* Advantages list */}
            <div className="col-12 col-lg-6">
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 28 }}>Unfair Advantage</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {TECH_ADVANTAGES.map((a) => (
                  <div key={a.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div
                      style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: 'rgba(56,189,248,0.1)',
                        border: '1px solid rgba(56,189,248,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <i className={`ph ${a.icon}`} style={{ fontSize: 18, color: '#38bdf8' }} />
                    </div>
                    <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', lineHeight: 1.65, paddingTop: 6 }}>{a.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Scrap Reduction visual */}
            <div className="col-12 col-lg-6 d-flex justify-content-center">
              <div
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 20,
                  padding: '32px 36px',
                  width: '100%',
                  maxWidth: 360,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', marginBottom: 20, letterSpacing: '0.05em' }}>
                  SCRAP REDUCTION
                </div>
                {/* Bar chart visual */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16, height: 120 }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, width: '100%', background: 'rgba(255,255,255,0.08)', borderRadius: '6px 6px 0 0', minHeight: 80 }} />
                    <span style={{ fontSize: 11, color: '#64748b' }}>Industry</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>14%</span>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: '100%', background: '#38bdf8', borderRadius: '6px 6px 0 0', height: 18 }} />
                    <span style={{ fontSize: 11, color: '#38bdf8' }}>Measured Markets</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8' }}>2.1%</span>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                  From 14% down to 2.1% material waste.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ECOSYSTEM ──────────────────────────────────────────────────────── */}
      <section id="ecosystem" style={{ padding: '80px 0', background: '#fff' }}>
        <div className="container">
          <div className="text-center" style={{ marginBottom: 56 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Ecosystem
            </span>
            <h2 style={{ fontSize: 'clamp(1.6rem,3.5vw,2.5rem)', fontWeight: 800, color: '#0f172a', marginTop: 8 }}>
              Five-Sided Network Effects
            </h2>
            <p style={{ fontSize: 15, color: '#64748b', maxWidth: 440, margin: '12px auto 0' }}>
              Every new user strengthens the platform. Every new factory lowers costs.
            </p>
          </div>

          <div className="row g-4 justify-content-center">
            {ECOSYSTEM_NODES.map((n) => (
              <div key={n.label} className="col-6 col-sm-4 col-md-auto">
                <div style={{ textAlign: 'center', padding: '20px 16px' }}>
                  <div
                    style={{
                      width: 60, height: 60, borderRadius: '50%',
                      background: '#f0f9ff', border: '1px solid #bae6fd',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 14px',
                    }}
                  >
                    <i className={`ph ${n.icon}`} style={{ fontSize: 26, color: '#0284c7' }} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 6 }}>{n.label}</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, maxWidth: 120, margin: '0 auto' }}>{n.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SBDMM PLATFORM HIGHLIGHT ───────────────────────────────────────── */}
      <section style={{ padding: '72px 0', background: 'linear-gradient(135deg,#e0f2fe 0%,#f0f9ff 100%)', borderTop: '1px solid #bae6fd' }}>
        <div className="container">
          <div className="row align-items-center g-5">
            <div className="col-12 col-lg-7">
              <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Platform Spotlight
              </span>
              <h2 style={{ fontSize: 'clamp(1.5rem,3vw,2.25rem)', fontWeight: 800, color: '#0f172a', marginTop: 8, letterSpacing: '-0.02em' }}>
                SBDMM — Furniture Platform
              </h2>
              <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.75, marginBottom: 24, maxWidth: 560 }}>
                Our flagship consumer product. Buyers upload a room photo, set style and
                budget preferences, and GPT-4o Vision generates three bespoke furniture
                concepts in seconds. Each concept is instantly matched to a verified local
                carpenter who quotes within 48 hours. Full logistics tracking from workshop
                to doorstep included.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 32 }}>
                {[
                  { icon: 'ph-magic-wand', label: '3 AI Concepts', sub: 'Per design session' },
                  { icon: 'ph-clock',      label: '48 h Response', sub: 'Avg. carpenter quote' },
                  { icon: 'ph-users-three', label: '500+ Artisans', sub: 'Verified &amp; reviewed' },
                  { icon: 'ph-star',       label: '98% Satisfaction', sub: 'Across all orders' },
                ].map((s) => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div
                      style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: '#0284c720', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', flexShrink: 0,
                      }}
                    >
                      <i className={`ph ${s.icon}`} style={{ fontSize: 20, color: '#0284c7' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }} dangerouslySetInnerHTML={{ __html: s.label }} />
                      <div style={{ fontSize: 12, color: '#64748b' }} dangerouslySetInnerHTML={{ __html: s.sub }} />
                    </div>
                  </div>
                ))}
              </div>
              <Link
                to="/login"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 15,
                  padding: '13px 28px', borderRadius: 12, textDecoration: 'none',
                  boxShadow: '0 4px 20px rgba(15,23,42,0.25)',
                }}
              >
                <i className="ph ph-arrow-square-out" /> Launch the Furniture Platform
              </Link>
            </div>
            <div className="col-12 col-lg-5 d-none d-lg-block">
              {/* Mini UI mockup */}
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #bae6fd',
                  borderRadius: 20,
                  overflow: 'hidden',
                  boxShadow: '0 8px 40px rgba(2,132,199,0.12)',
                }}
              >
                {/* Browser chrome */}
                <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 6, alignItems: 'center' }}>
                  {['#ef4444','#f59e0b','#10b981'].map(c => (
                    <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                  ))}
                  <span style={{ flex: 1, height: 22, borderRadius: 5, background: '#e2e8f0', marginLeft: 8, fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
                    sbdmm.app/design
                  </span>
                </div>
                {/* Content preview */}
                <div style={{ padding: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', marginBottom: 12 }}>AI DESIGN CONCEPTS</div>
                  {[
                    { label: 'Budget Concept', price: '$800 – $1,100', color: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
                    { label: 'Standard Concept', price: '$1,800 – $2,400', color: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', active: true },
                    { label: 'Premium Concept', price: '$3,200 – $4,500', color: '#faf5ff', border: '#e9d5ff', text: '#6b21a8' },
                  ].map(c => (
                    <div
                      key={c.label}
                      style={{
                        background: c.color, border: `1px solid ${c.border}`,
                        borderRadius: 10, padding: '10px 14px', marginBottom: 8,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        boxShadow: c.active ? '0 0 0 2px #0284c7' : undefined,
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 13, color: c.text }}>{c.label}</span>
                      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{c.price}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 14, padding: '12px 14px', background: '#f8fafc', borderRadius: 10, fontSize: 13, color: '#475569', lineHeight: 1.6, fontStyle: 'italic' }}>
                    "Live-edge walnut dining table with tapered steel legs — matched to your room's palette and scale."
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['Walnut','Steel Legs','180 × 90 cm','6-Seater'].map(tag => (
                      <span key={tag} style={{ background: '#e0f2fe', color: '#0284c7', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── INVESTMENT HIGHLIGHTS ──────────────────────────────────────────── */}
      <section id="investment" style={{ padding: '80px 0', background: 'linear-gradient(160deg,#0f172a 0%,#1e3a5f 100%)' }}>
        <div className="container text-center">
          <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Investment Highlights
          </span>
          <h2 style={{ fontSize: 'clamp(1.6rem,3.5vw,2.5rem)', fontWeight: 800, color: '#fff', marginTop: 10, marginBottom: 16, letterSpacing: '-0.02em' }}>
            Bankable. Scalable. Profitable.
          </h2>
          <p style={{ fontSize: 15, color: '#64748b', marginBottom: 48 }}>
            Measured Markets is capital-efficient: break-even at 13,800 units/month, 72% IRR base case.
          </p>

          <div className="row g-4 justify-content-center" style={{ marginBottom: 48 }}>
            {INVEST_STATS.map((s) => (
              <div key={s.label} className="col-6 col-md-3">
                <div style={{ fontSize: 'clamp(1.75rem,3vw,2.5rem)', fontWeight: 800, color: '#38bdf8' }}>{s.value}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <a
            href="mailto:investors@measuredmarkets.com"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#38bdf8', color: '#0f172a', fontWeight: 700, fontSize: 15,
              padding: '14px 32px', borderRadius: 12, textDecoration: 'none',
            }}
          >
            <i className="ph ph-download-simple" /> Download Investor Deck
          </a>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer style={{ background: '#0a0f1a', color: '#64748b', padding: '56px 0 0' }}>
        <div className="container">
          <div className="row g-4" style={{ paddingBottom: 48 }}>

            {/* Brand */}
            <div className="col-12 col-md-4">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, background: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a', fontWeight: 800, fontSize: 14 }}>MM</span>
                <span style={{ fontWeight: 700, color: '#fff', fontSize: 16 }}>Measured Markets</span>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>
                Bespoke for Everyone. Precision at Scale.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                {['ph-linkedin-logo','ph-twitter-logo','ph-facebook-logo'].map(ic => (
                  <a key={ic} href="#" style={{ color: '#64748b', fontSize: 18 }} aria-label={ic}>
                    <i className={`ph ${ic}`} />
                  </a>
                ))}
              </div>
            </div>

            {/* Products */}
            <div className="col-6 col-md-2">
              <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 13, marginBottom: 16, letterSpacing: '0.02em' }}>Products</div>
              {['Apparel', 'Furniture Platform', 'Flat-Pack Housing'].map(l => (
                <a key={l} href="#products" style={{ display: 'block', fontSize: 14, color: '#64748b', textDecoration: 'none', marginBottom: 8 }}>
                  {l}
                </a>
              ))}
            </div>

            {/* Company */}
            <div className="col-6 col-md-2">
              <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 13, marginBottom: 16, letterSpacing: '0.02em' }}>Company</div>
              {['About Us', 'Investors', 'Careers', 'Blog'].map(l => (
                <a key={l} href="#" style={{ display: 'block', fontSize: 14, color: '#64748b', textDecoration: 'none', marginBottom: 8 }}>{l}</a>
              ))}
            </div>

            {/* Partners */}
            <div className="col-12 col-md-4">
              <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 13, marginBottom: 16, letterSpacing: '0.02em' }}>Partners</div>
              {['Micro-Factory Portal', 'Supplier Network', 'Logistics API', 'Contract Support'].map(l => (
                <a key={l} href="#" style={{ display: 'block', fontSize: 14, color: '#64748b', textDecoration: 'none', marginBottom: 8 }}>{l}</a>
              ))}
            </div>

          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '18px 0' }}>
          <div className="container d-flex flex-wrap justify-content-between align-items-center" style={{ gap: 12, fontSize: 13 }}>
            <span>© 2026 Measured Markets Inc. All rights reserved.</span>
            <span style={{ display: 'flex', gap: 20 }}>
              <a href="#" style={{ color: '#64748b', textDecoration: 'none' }}>Privacy Policy</a>
              <a href="#" style={{ color: '#64748b', textDecoration: 'none' }}>Terms of Service</a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
