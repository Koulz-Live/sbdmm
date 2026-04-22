/**
 * LandingPage — Public marketing page at /
 *
 * Layout mirrors the MarketPro HomePageOne template:
 *   - Fixed top-bar → sticky nav header (with mobile hamburger)
 *   - Hero banner with CTA
 *   - Features / service modes strip
 *   - "Why SBDMM" value-prop section
 *   - How it works steps
 *   - Vendor / logistics stats
 *   - Testimonials
 *   - CTA banner
 *   - Footer (5-column → stacks on mobile, correct 12-col grid)
 *
 * Uses only Bootstrap 5 + Phosphor icons (already in the bundle).
 * Zero new npm dependencies.
 *
 * Responsive fixes applied:
 *   - Replaced all non-standard Bootstrap gap/mb classes with inline styles
 *   - Footer grid: 3+2+2+2+3 = 12 cols (was 4+2+2+2+4 = 14, broken)
 *   - Hero mockup hidden on mobile (d-none d-lg-flex)
 *   - TopBar swaps contact info for tagline on xs
 *   - StickyNav: hamburger toggle below lg, mobile dropdown menu
 *   - col-12 fallback on all row children for correct stacking
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { PlatformRole } from '@sbdmm/shared';

function getRoleHome(role: PlatformRole): string {
  switch (role) {
    case 'vendor':
    case 'logistics_provider': return '/provider/dashboard';
    case 'tenant_admin':
    case 'super_admin':        return '/admin';
    default:                   return '/dashboard';
  }
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const DESIGN_STEPS = [
  { icon: 'ph-house-line',    label: 'Pick Room Type',       desc: 'Living, dining, office or kitchen nook.' },
  { icon: 'ph-image',         label: 'Upload a Photo',        desc: 'Snap your space — AI reads scale & colour.' },
  { icon: 'ph-sliders',       label: 'Set Preferences',       desc: 'Style, material, seating size & budget.' },
  { icon: 'ph-cpu',           label: 'AI Generates Concepts', desc: 'GPT-4o Vision produces three bespoke designs.' },
  { icon: 'ph-pencil-simple', label: 'Refine in One Message', desc: '"Hairpin legs" or "darker stain" — live updates.' },
  { icon: 'ph-hammer',        label: 'Connect to Carpenters', desc: 'Verified artisans quote your brief in 48 h.' },
  { icon: 'ph-package',       label: 'Order & Track',         desc: 'Full logistics visibility from workshop to door.' },
  { icon: 'ph-star',          label: 'Rate & Reorder',        desc: 'Build a relationship with your craftsperson.' },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: 'ph-magic-wand',
    title: 'Describe your vision',
    desc: 'Upload a room photo and tell us your style, material preference, seating size, and budget. Takes under two minutes.',
  },
  {
    step: '02',
    icon: 'ph-cpu',
    title: 'AI designs your table',
    desc: "GPT-4o Vision analyses your room's palette, scale, and existing furniture — then generates three tailored concepts.",
  },
  {
    step: '03',
    icon: 'ph-pencil-simple',
    title: 'Refine with plain English',
    desc: 'Type "hairpin legs", "darker stain", or "add a shelf" and the AI revises the design live — no design skills needed.',
  },
  {
    step: '04',
    icon: 'ph-hammer',
    title: 'Matched to a carpenter',
    desc: 'Your brief goes to verified local artisans. Compare quotes, read reviews, and award in one click.',
  },
];

const STATS = [
  { value: '3',    label: 'AI Concepts per Session' },
  { value: '48 h', label: 'Avg. Carpenter Response' },
  { value: '500+', label: 'Verified Artisans' },
  { value: '98%',  label: 'Customer Satisfaction' },
];

const TESTIMONIALS = [
  {
    quote: "I uploaded a photo of my living room and within seconds had three table designs that actually matched my colour palette. The walnut concept was exactly what I had in my head but couldn't articulate.",
    name: 'Amara Osei',
    title: 'Interior enthusiast, Accra',
    initials: 'AO',
    color: '#299E60',
  },
  {
    quote: 'The carpenter matched to my brief was brilliant. The AI brief was so detailed — dimensions, wood grain direction, leg style — that the quote came back the same day and was exactly on budget.',
    name: 'James Whitfield',
    title: 'Homeowner, Manchester',
    initials: 'JW',
    color: '#1d4ed8',
  },
  {
    quote: 'As a carpenter I was sceptical, but the briefs I receive through SBDMM are the most detailed I\'ve ever seen. Clients know exactly what they want and are ready to commit.',
    name: 'Lena Braun',
    title: 'Master Carpenter, Berlin',
    initials: 'LB',
    color: '#7e22ce',
  },
];

const NAV_LINKS = [
  { label: 'How It Works',   href: '#how-it-works' },
  { label: 'Design My Table', href: '#design-my-table' },
  { label: 'Carpenters',     href: '#vendors' },
  { label: 'Contact',        href: '#contact' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function TopBar() {
  return (
    <div style={{ background: '#1e293b', color: '#94a3b8', fontSize: 12, padding: '8px 0' }}>
      <div className="container d-flex justify-content-between align-items-center flex-wrap" style={{ gap: 8 }}>
        {/* sm+: show phone & email */}
        <span className="d-none d-sm-flex align-items-center" style={{ gap: 6 }}>
          <i className="ph ph-phone" style={{ color: '#299E60' }} />
          +1 (800) 123-4567
          <span style={{ margin: '0 10px', opacity: 0.3 }}>|</span>
          <i className="ph ph-envelope" style={{ color: '#299E60' }} />
          hello@sbdmm.com
        </span>
        {/* xs: show compact tagline instead */}
        <span className="d-flex d-sm-none align-items-center" style={{ gap: 6, color: '#64748b' }}>
          <i className="ph ph-globe-hemisphere-west" style={{ color: '#299E60' }} />
          Global Trade &amp; Logistics Platform
        </span>
        <span className="d-flex align-items-center" style={{ gap: 12 }}>
          {['ph-linkedin-logo', 'ph-twitter-logo', 'ph-facebook-logo'].map((ic) => (
            <a key={ic} href="#" style={{ color: '#94a3b8' }}>
              <i className={`ph ${ic}`} />
            </a>
          ))}
        </span>
      </div>
    </div>
  );
}

function StickyNav({ scrolled }: { scrolled: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        background: '#fff',
        boxShadow: scrolled ? '0 2px 20px rgba(0,0,0,0.08)' : '0 1px 0 #f1f5f9',
        transition: 'box-shadow 0.2s',
      }}
    >
      <div className="container">
        {/* Main row */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 0',
            gap: 16,
          }}
        >
          {/* Logo */}
          <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: '#299E60',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 800,
                fontSize: 16,
              }}
            >
              S
            </span>
            <span style={{ fontWeight: 700, fontSize: 18, color: '#1e293b', letterSpacing: '-0.02em' }}>
              SBDMM
            </span>
          </a>

          {/* Desktop nav links (lg+) */}
          <div className="d-none d-lg-flex align-items-center" style={{ gap: 32 }}>
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                style={{ fontSize: 14, fontWeight: 500, color: '#475569', textDecoration: 'none' }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#299E60')}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = '#475569')}
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Right cluster: Sign In + Get Started + Hamburger */}
          <div className="d-flex align-items-center" style={{ gap: 8 }}>
            <Link
              to="/login"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#334155',
                textDecoration: 'none',
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                whiteSpace: 'nowrap',
              }}
            >
              Sign In
            </Link>
            {/* Get Started hidden on xs */}
            <Link
              to="/login"
              className="d-none d-sm-inline-flex align-items-center"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                textDecoration: 'none',
                padding: '8px 18px',
                borderRadius: 8,
                background: '#299E60',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              Get Started <i className="ph ph-arrow-right" />
            </Link>
            {/* Hamburger (below lg) */}
            <button
              className="d-flex d-lg-none align-items-center justify-content-center"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle navigation"
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: menuOpen ? '#f1f5f9' : '#fff',
                cursor: 'pointer',
                fontSize: 20,
                color: '#1e293b',
                flexShrink: 0,
              }}
            >
              <i className={`ph ${menuOpen ? 'ph-x' : 'ph-list'}`} />
            </button>
          </div>
        </nav>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="d-lg-none" style={{ borderTop: '1px solid #f1f5f9', paddingBottom: 12 }}>
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  display: 'block',
                  padding: '10px 4px',
                  fontSize: 15,
                  fontWeight: 500,
                  color: '#475569',
                  textDecoration: 'none',
                  borderBottom: '1px solid #f8fafc',
                }}
              >
                {l.label}
              </a>
            ))}
            {/* Get Started CTA for xs (where the header button is hidden) */}
            <div className="d-sm-none" style={{ paddingTop: 8 }}>
              <Link
                to="/login"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  background: '#299E60',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  padding: '10px 0',
                  borderRadius: 8,
                  textDecoration: 'none',
                  marginTop: 8,
                }}
              >
                Get Started Free
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  // Authenticated users skip the landing page — redirect to their role home
  useEffect(() => {
    if (!isLoading && isAuthenticated && profile?.role) {
      navigate(getRoleHome(profile.role), { replace: true });
    }
  }, [isAuthenticated, isLoading, profile, navigate]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="spinner-border" style={{ color: '#299E60', width: 40, height: 40 }} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", color: '#1e293b', overflowX: 'hidden' }}>
      <TopBar />
      <StickyNav scrolled={scrolled} />

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #064e3b 100%)',
          padding: '72px 0 0',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 400, height: 400, background: '#299E6015', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: -60, width: 280, height: 280, background: '#1d4ed808', borderRadius: '50%', pointerEvents: 'none' }} />

        <div className="container" style={{ position: 'relative' }}>
          <div className="row align-items-center" style={{ rowGap: 40 }}>

            {/* Copy */}
            <div className="col-12 col-lg-6">
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#299E6020',
                  border: '1px solid #299E6040',
                  color: '#6ee7b7',
                  borderRadius: 20,
                  padding: '4px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  marginBottom: 20,
                  textTransform: 'uppercase',
                }}
              >
                <i className="ph ph-magic-wand" /> AI-Powered Furniture Design
              </span>

              <h1
                style={{
                  fontSize: 'clamp(1.85rem, 5vw, 3.25rem)',
                  fontWeight: 800,
                  color: '#fff',
                  lineHeight: 1.15,
                  marginBottom: 20,
                  letterSpacing: '-0.02em',
                }}
              >
                Your Room. Your Style.{' '}
                <span style={{ color: '#299E60' }}>Your Table</span>,{' '}
                Built by a Craftsperson.
              </h1>

              <p style={{ fontSize: 16, color: '#94a3b8', lineHeight: 1.7, marginBottom: 32, maxWidth: 500 }}>
                Upload a photo of your room, set your preferences, and our AI generates
                three bespoke table designs in seconds — then connects you with a
                verified local carpenter to bring it to life.
              </p>

              <div className="d-flex flex-wrap" style={{ gap: 12, marginBottom: 32 }}>
                <Link
                  to="/login"
                  style={{
                    background: '#299E60',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 15,
                    padding: '13px 26px',
                    borderRadius: 10,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 4px 20px rgba(41,158,96,0.4)',
                  }}
                >
                  Design My Table <i className="ph ph-magic-wand" />
                </Link>
                <a
                  href="#how-it-works"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: '#e2e8f0',
                    fontWeight: 600,
                    fontSize: 15,
                    padding: '13px 26px',
                    borderRadius: 10,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                >
                  <i className="ph ph-play-circle" /> See How It Works
                </a>
              </div>

              {/* Trust bar */}
              <div className="d-flex flex-wrap" style={{ gap: 16, fontSize: 13, color: '#64748b', paddingBottom: 8 }}>
                {['Free to try', 'No credit card required', 'Results in under 60 seconds'].map((t) => (
                  <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ph ph-check-circle" style={{ color: '#299E60', fontSize: 16 }} />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* AI concept preview mockup — hidden on mobile */}
            <div className="col-lg-6 d-none d-lg-flex justify-content-center">
              <div
                style={{
                  width: '100%',
                  maxWidth: 520,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 20,
                  padding: 20,
                  backdropFilter: 'blur(10px)',
                }}
              >
                {/* Browser chrome */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                  {['#ef4444', '#f59e0b', '#10b981'].map((c) => (
                    <span key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
                  ))}
                  <span
                    style={{
                      flex: 1, height: 28, borderRadius: 6,
                      background: 'rgba(255,255,255,0.06)', marginLeft: 8,
                      display: 'flex', alignItems: 'center', paddingLeft: 12,
                      fontSize: 11, color: '#475569',
                    }}
                  >
                    sbdmm.vercel.app/design
                  </span>
                </div>

                {/* Wizard progress */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                  {[1,2,3,4,5,6,7,8].map((n) => (
                    <div
                      key={n}
                      style={{
                        flex: 1, height: 4, borderRadius: 4,
                        background: n <= 4 ? '#299E60' : 'rgba(255,255,255,0.1)',
                      }}
                    />
                  ))}
                </div>

                {/* AI output card */}
                <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <i className="ph ph-star-four" style={{ color: '#299E60', fontSize: 16 }} />
                    <span style={{ color: '#4ade80', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em' }}>
                      AI DESIGN CONCEPT · STANDARD
                    </span>
                  </div>
                  <div style={{ color: '#e2e8f0', fontSize: 12, lineHeight: 1.65, fontStyle: 'italic', marginBottom: 12 }}>
                    "Live-edge walnut dining table with tapered black steel legs. The organic grain contrasts with your exposed brick wall and complements the oak floor."
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {['Walnut', 'Steel Legs', '180 × 90 cm', '6-Seater', '$1,800–$2,400'].map((tag) => (
                      <span
                        key={tag}
                        style={{
                          background: 'rgba(41,158,96,0.2)', border: '1px solid rgba(41,158,96,0.3)',
                          color: '#4ade80', borderRadius: 20, padding: '2px 10px',
                          fontSize: 11, fontWeight: 600,
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 3 concept tabs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Budget', price: '$800–$1,100', active: false },
                    { label: 'Standard', price: '$1,800–$2,400', active: true },
                    { label: 'Premium', price: '$3,200–$4,500', active: false },
                  ].map((c) => (
                    <div
                      key={c.label}
                      style={{
                        background: c.active ? 'rgba(41,158,96,0.2)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${c.active ? 'rgba(41,158,96,0.5)' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: 10, padding: '10px 8px', textAlign: 'center',
                      }}
                    >
                      <div style={{ color: c.active ? '#4ade80' : '#94a3b8', fontWeight: 700, fontSize: 12 }}>{c.label}</div>
                      <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>{c.price}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Wave divider */}
        <svg viewBox="0 0 1440 60" style={{ display: 'block', marginTop: 60, width: '100%' }} preserveAspectRatio="none">
          <path d="M0,60 C360,0 1080,0 1440,60 L1440,60 L0,60 Z" fill="#f8fafc" />
        </svg>
      </section>

      {/* ── Stats strip ────────────────────────────────────────────────── */}
      <section style={{ background: '#f8fafc', paddingBottom: 56 }}>
        <div className="container">
          <div className="row" style={{ rowGap: 24 }}>
            {STATS.map((s) => (
              <div key={s.label} className="col-6 col-md-3 text-center">
                <div style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', fontWeight: 800, color: '#299E60', lineHeight: 1 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Design wizard steps strip ───────────────────────────────────── */}
      <section id="features" style={{ padding: '72px 0', background: '#fff' }}>
        <div className="container">
          <div className="text-center" style={{ marginBottom: 48 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#299E60', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              The Process
            </span>
            <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', fontWeight: 800, color: '#1e293b', marginTop: 8 }}>
              From room photo to finished table — 8 steps
            </h2>
            <p style={{ fontSize: 15, color: '#64748b', maxWidth: 540, margin: '12px auto 0' }}>
              Our AI-guided wizard does the heavy lifting. You just make the choices.
            </p>
          </div>

          <div className="row g-3">
            {DESIGN_STEPS.map((s, i) => (
              <div key={s.label} className="col-6 col-sm-4 col-lg-3">
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 16,
                    padding: '24px 16px',
                    textAlign: 'center',
                    height: '100%',
                    position: 'relative',
                    transition: 'all 0.2s',
                    cursor: 'default',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget;
                    el.style.background = '#f0fdf4';
                    el.style.borderColor = '#299E60';
                    el.style.transform = 'translateY(-4px)';
                    el.style.boxShadow = '0 8px 24px rgba(41,158,96,0.12)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget;
                    el.style.background = '#f8fafc';
                    el.style.borderColor = '#e2e8f0';
                    el.style.transform = '';
                    el.style.boxShadow = '';
                  }}
                >
                  <span
                    style={{
                      position: 'absolute', top: 12, right: 14,
                      fontSize: 11, fontWeight: 700, color: '#299E60',
                      background: '#f0fdf4', border: '1px solid #bbf7d0',
                      borderRadius: 6, padding: '1px 7px',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <i className={`ph ${s.icon}`} style={{ fontSize: 32, color: '#299E60', display: 'block', marginBottom: 10 }} />
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: '72px 0', background: '#f8fafc' }}>
        <div className="container">
          <div className="text-center" style={{ marginBottom: 48 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#299E60', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              How It Works
            </span>
            <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', fontWeight: 800, color: '#1e293b', marginTop: 8 }}>
              From idea to carpenter in four steps
            </h2>
            <p style={{ fontSize: 15, color: '#64748b', maxWidth: 500, margin: '12px auto 0' }}>
              AI does the design work. A verified craftsperson builds it. You enjoy the result.
            </p>
          </div>

          <div className="row g-4">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} className="col-12 col-sm-6 col-lg-3">
                <div
                  style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 16,
                    padding: 28,
                    height: '100%',
                    position: 'relative',
                  }}
                >
                  {/* Connector line — desktop only */}
                  {i < HOW_IT_WORKS.length - 1 && (
                    <div
                      className="d-none d-lg-block"
                      style={{
                        position: 'absolute',
                        top: 36,
                        right: -20,
                        width: 20,
                        height: 2,
                        background: '#e2e8f0',
                        zIndex: 1,
                      }}
                    />
                  )}
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 16,
                    }}
                  >
                    <i className={`ph ${step.icon}`} style={{ fontSize: 24, color: '#299E60' }} />
                  </div>
                  <span
                    style={{
                      position: 'absolute',
                      top: 16,
                      right: 20,
                      fontSize: 32,
                      fontWeight: 800,
                      color: '#f1f5f9',
                      lineHeight: 1,
                      userSelect: 'none',
                    }}
                  >
                    {step.step}
                  </span>
                  <h5 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>{step.title}</h5>
                  <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Design My Table ────────────────────────────────────────────── */}
      <section
        id="design-my-table"
        style={{
          padding: '80px 0',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f2d1a 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative glow */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: -80, right: -80,
            width: 380, height: 380, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(41,158,96,0.18) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          {/* Header */}
          <div className="text-center mb-5">
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(41,158,96,0.15)', border: '1px solid rgba(41,158,96,0.4)',
                color: '#4ade80', borderRadius: 20, padding: '5px 16px',
                fontSize: 13, fontWeight: 600, marginBottom: 20,
              }}
            >
              <i className="ph ph-magic-wand" style={{ fontSize: 15 }} />
              AI-Powered Design
            </span>
            <h2
              style={{
                fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 800,
                color: '#fff', lineHeight: 1.2, marginBottom: 16,
              }}
            >
              Design My Table
            </h2>
            <p style={{ fontSize: '1.05rem', color: '#94a3b8', maxWidth: 540, margin: '0 auto' }}>
              Upload a photo of your room. Our AI analyses the space and generates three
              bespoke table designs — then connects you with skilled local carpenters to build it.
            </p>
          </div>

          {/* 6-step flow */}
          <div className="row g-3 mb-5 justify-content-center">
            {[
              { icon: 'ph ph-image',        num: '01', label: 'Upload Room Photo',      desc: 'Drag & drop or snap a photo of the space.' },
              { icon: 'ph ph-sliders',      num: '02', label: 'Set Your Preferences',   desc: 'Choose style, material, seating & budget.' },
              { icon: 'ph ph-cpu',          num: '03', label: 'AI Analyses Your Space', desc: "GPT-4o Vision reads your room's colour, scale and style." },
              { icon: 'ph ph-palette',      num: '04', label: '3 Concepts Generated',   desc: 'Budget, Standard and Premium designs — tailored to you.' },
              { icon: 'ph ph-pencil',       num: '05', label: 'Refine with One Tap',    desc: '"Make it rounder" or "use hairpin legs" — AI updates live.' },
              { icon: 'ph ph-hammer',       num: '06', label: 'Sent to Carpenters',     desc: 'Verified artisans quote your brief within 48 hours.' },
            ].map((item) => (
              <div key={item.num} className="col-6 col-md-4">
                <div
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    borderRadius: 16, padding: '20px 18px',
                    height: '100%',
                  }}
                >
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <span
                      style={{
                        fontSize: 11, fontWeight: 700, color: '#299E60',
                        background: 'rgba(41,158,96,0.15)', borderRadius: 6,
                        padding: '2px 8px', letterSpacing: '0.06em',
                      }}
                    >
                      {item.num}
                    </span>
                    <i className={item.icon} style={{ color: '#299E60', fontSize: 18 }} />
                  </div>
                  <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.9rem', marginBottom: 6 }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.55 }}>
                    {item.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* AI example output card */}
          <div
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(41,158,96,0.25)',
              borderRadius: 20, padding: '28px 24px',
              maxWidth: 560, margin: '0 auto 48px',
            }}
          >
            <div className="d-flex align-items-center gap-2 mb-3">
              <i className="ph ph-star-four" style={{ color: '#299E60', fontSize: 20 }} />
              <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.88rem' }}>
                EXAMPLE AI OUTPUT
              </span>
            </div>
            <div style={{ color: '#e2e8f0', fontStyle: 'italic', fontSize: '0.9rem', lineHeight: 1.7, marginBottom: 16 }}>
              "For your warm-toned dining room with exposed brick, I recommend a live-edge walnut
              dining table with tapered black steel legs. The organic edge contrasts beautifully with
              the industrial brick texture, while the deep walnut grain complements your existing
              oak flooring."
            </div>
            <div className="d-flex flex-wrap gap-2">
              {['Live-edge Walnut', 'Black Steel Legs', '180cm × 90cm', '6-Seater', '$1,800–$2,400'].map((tag) => (
                <span
                  key={tag}
                  style={{
                    background: 'rgba(41,158,96,0.15)', border: '1px solid rgba(41,158,96,0.3)',
                    color: '#4ade80', borderRadius: 20, padding: '3px 12px', fontSize: '0.78rem', fontWeight: 600,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <a
              href="/login"
              className="btn btn-lg px-5 fw-bold"
              style={{
                background: '#299E60', color: '#fff', borderRadius: 14,
                fontSize: '1rem', padding: '14px 36px',
                boxShadow: '0 4px 24px rgba(41,158,96,0.35)',
                textDecoration: 'none', display: 'inline-block',
              }}
            >
              <i className="ph ph-magic-wand me-2" />
              Try Design My Table Free
            </a>
            <p style={{ color: '#64748b', marginTop: 14, fontSize: '0.85rem' }}>
              Free to try — no credit card required
            </p>
          </div>
        </div>
      </section>

      {/* ── Value props ────────────────────────────────────────────────── */}
      <section id="vendors" style={{ padding: '72px 0', background: '#fff' }}>
        <div className="container">
          <div className="row align-items-center" style={{ rowGap: 48 }}>

            {/* Feature list */}
            <div className="col-12 col-lg-6">
              <span style={{ fontSize: 12, fontWeight: 700, color: '#299E60', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Why SBDMM
              </span>
              <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', fontWeight: 800, color: '#1e293b', marginTop: 8, marginBottom: 28 }}>
                The smartest way to get bespoke furniture
              </h2>
              {[
                { icon: 'ph-cpu', title: 'GPT-4o Vision Design',  desc: 'Our AI reads your room photo — lighting, colour, existing furniture — and designs a table that looks like it belongs there.' },
                { icon: 'ph-users-three', title: 'Verified Carpenter Network', desc: 'Every artisan is vetted for quality and reliability. Read reviews, view past work, and award with confidence.' },
                { icon: 'ph-lock-simple',  title: 'Your Data Stays Yours', desc: 'Design sessions, photos, and preferences are isolated by tenant at the database level. We never share your data.' },
                { icon: 'ph-package', title: 'End-to-End Order Tracking', desc: 'From workshop to doorstep — track your build in real time, with automated notifications at every milestone.' },
                { icon: 'ph-hands-praying', title: 'Business with Purpose', desc: 'We operate on the belief that honest commerce, fair pay for craftspeople, and excellent service are worth doing right — and worth dedicating to something greater than profit.' },
              ].map((f) => (
                <div key={f.title} style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <i className={`ph ${f.icon}`} style={{ fontSize: 22, color: '#299E60' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 4 }}>{f.title}</div>
                    <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Feature cards grid */}
            <div className="col-12 col-lg-6">
              <div className="row g-3">
                {[
                  { icon: 'ph-magic-wand',      title: 'AI-Generated Designs',    sub: '3 bespoke concepts per session',     color: '#f0fdf4', iconColor: '#299E60' },
                  { icon: 'ph-clock-countdown',  title: '48 h Response Time',      sub: 'Avg. quote turnaround',              color: '#eff6ff', iconColor: '#1d4ed8' },
                  { icon: 'ph-currency-dollar',  title: 'Budget Tiers',            sub: 'Budget, Standard & Premium',         color: '#fff7ed', iconColor: '#c2410c' },
                  { icon: 'ph-star',             title: 'Rated Craftspeople',       sub: 'Reviews from real buyers',           color: '#fdf4ff', iconColor: '#7e22ce' },
                  { icon: 'ph-pencil-simple',    title: 'Natural Language Refine',  sub: 'Plain-English design iteration',     color: '#fefce8', iconColor: '#a16207' },
                  { icon: 'ph-chart-line-up',    title: 'Order Analytics',          sub: 'Spend & timeline insights',          color: '#f0fdfa', iconColor: '#0f766e' },
                ].map((c) => (
                  <div key={c.title} className="col-6">
                    <div
                      style={{
                        background: c.color,
                        borderRadius: 14,
                        padding: '18px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        height: '100%',
                      }}
                    >
                      <i className={`ph ${c.icon}`} style={{ fontSize: 26, color: c.iconColor }} />
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{c.title}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{c.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────────── */}
      <section style={{ padding: '72px 0', background: '#f8fafc' }}>
        <div className="container">
          <div className="text-center" style={{ marginBottom: 48 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#299E60', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Testimonials
            </span>
            <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', fontWeight: 800, color: '#1e293b', marginTop: 8 }}>
              Loved by buyers and carpenters alike
            </h2>
          </div>
          <div className="row g-4">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="col-12 col-md-4">
                <div
                  style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 16,
                    padding: 28,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ marginBottom: 16 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <i key={s} className="ph-fill ph-star" style={{ color: '#f59e0b', fontSize: 14 }} />
                    ))}
                  </div>
                  <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.7, flex: 1, marginBottom: 20, fontStyle: 'italic' }}>
                    "{t.quote}"
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: t.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 15,
                        flexShrink: 0,
                      }}
                    >
                      {t.initials}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.title}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ─────────────────────────────────────────────────── */}
      <section
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #1e293b 100%)',
          padding: '72px 0',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, background: '#299E6015', borderRadius: '50%', pointerEvents: 'none' }} />
        <div className="container text-center" style={{ position: 'relative' }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 800, color: '#fff', marginBottom: 16 }}>
            Your perfect table is one photo away.
          </h2>
          <p style={{ fontSize: 16, color: '#94a3b8', maxWidth: 520, margin: '0 auto 36px' }}>
            Join thousands of homeowners using SBDMM to design bespoke furniture with AI
            and get it built by a craftsperson who cares about their work.
          </p>
          <div className="d-flex flex-wrap justify-content-center" style={{ gap: 12 }}>
            <Link
              to="/login"
              style={{
                background: '#299E60',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                padding: '13px 30px',
                borderRadius: 10,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 20px rgba(41,158,96,0.4)',
              }}
            >
              Design My Table <i className="ph ph-magic-wand" />
            </Link>
            <a
              href="#how-it-works"
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                fontWeight: 600,
                fontSize: 15,
                padding: '13px 30px',
                borderRadius: 10,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              <i className="ph ph-play-circle" /> See How It Works
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      {/*
        12-column grid breakdown:
          col-lg-3  Brand    (3)
          col-lg-2  Platform (2)
          col-lg-2  Company  (2)
          col-lg-2  Portals  (2)
          col-lg-3  Contact  (3)
          Total: 3+2+2+2+3 = 12 ✓

        md breakpoint: 2-up layout (col-md-6 / col-md-3)
        sm/xs: full-width stack
      */}
      <footer id="contact" style={{ background: '#0f172a', padding: '60px 0 0' }}>
        <div className="container">
          <div className="row" style={{ rowGap: 40, marginBottom: 48 }}>

            {/* Brand */}
            <div className="col-12 col-md-6 col-lg-3">
              <a href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: '#299E60',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 16,
                  }}
                >
                  S
                </span>
                <span style={{ fontWeight: 700, fontSize: 18, color: '#fff' }}>SBDMM</span>
              </a>
              <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, maxWidth: 280, marginBottom: 12 }}>
                A multi-tenant AI furniture design platform. Describe your room, get three bespoke designs, and have them built by a verified craftsperson.
              </p>
              <p style={{ fontSize: 12, color: '#334155', lineHeight: 1.7, maxWidth: 280, marginBottom: 20, fontStyle: 'italic' }}>
                Built on the conviction that honest work, fair trade, and excellence in craft are acts of worship. We run this business to the glory of God.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                {['ph-linkedin-logo', 'ph-twitter-logo', 'ph-github-logo'].map((ic) => (
                  <a
                    key={ic}
                    href="#"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: '#1e293b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#64748b',
                      fontSize: 16,
                    }}
                  >
                    <i className={`ph ${ic}`} />
                  </a>
                ))}
              </div>
            </div>

            {/* Platform */}
            <div className="col-6 col-md-3 col-lg-2">
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 13, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Platform</div>
              {['Design My Table', 'Dashboard', 'Orders', 'Vendors', 'Documents', 'Compliance'].map((l) => (
                <a key={l} href="/login" style={{ display: 'block', color: '#64748b', fontSize: 13, marginBottom: 10, textDecoration: 'none' }}>{l}</a>
              ))}
            </div>

            {/* Company */}
            <div className="col-6 col-md-3 col-lg-2">
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 13, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Company</div>
              {['About', 'Blog', 'Careers', 'Press', 'Partners'].map((l) => (
                <a key={l} href="#" style={{ display: 'block', color: '#64748b', fontSize: 13, marginBottom: 10, textDecoration: 'none' }}>{l}</a>
              ))}
            </div>

            {/* Portals */}
            <div className="col-6 col-md-3 col-lg-2">
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 13, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Portals</div>
              <Link
                to="/login"
                style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13, marginBottom: 12, textDecoration: 'none' }}
              >
                <i className="ph ph-storefront" style={{ color: '#299E60', fontSize: 15, flexShrink: 0 }} />
                Vendor Login
              </Link>
              <Link
                to="/login?role=admin"
                style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13, marginBottom: 12, textDecoration: 'none' }}
              >
                <i className="ph ph-shield-check" style={{ color: '#299E60', fontSize: 15, flexShrink: 0 }} />
                Admin Login
              </Link>
              <Link
                to="/login"
                style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13, marginBottom: 12, textDecoration: 'none' }}
              >
                <i className="ph ph-user-circle" style={{ color: '#299E60', fontSize: 15, flexShrink: 0 }} />
                Buyer Login
              </Link>
            </div>

            {/* Contact + Newsletter */}
            <div className="col-6 col-md-3 col-lg-3">
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 13, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Contact</div>
              {[
                { icon: 'ph-envelope', text: 'hello@sbdmm.com' },
                { icon: 'ph-phone',    text: '+1 (800) 123-4567' },
                { icon: 'ph-map-pin',  text: '789 Inner Lane, California, USA' },
              ].map((c) => (
                <div key={c.icon} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
                  <i className={`ph ${c.icon}`} style={{ color: '#299E60', fontSize: 15, marginTop: 1, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#64748b' }}>{c.text}</span>
                </div>
              ))}

              <div style={{ marginTop: 20 }}>
                <div style={{ fontWeight: 600, color: '#94a3b8', fontSize: 12, marginBottom: 10 }}>Stay updated</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: 13,
                      color: '#e2e8f0',
                      outline: 'none',
                    }}
                  />
                  <button
                    style={{
                      background: '#299E60',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 14px',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <i className="ph ph-paper-plane-tilt" />
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* Bottom bar */}
          <div
            style={{
              borderTop: '1px solid #1e293b',
              padding: '20px 0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 12, color: '#475569' }}>
              © {new Date().getFullYear()} SBDMM. All rights reserved.
            </span>
            <span style={{ fontSize: 12, color: '#334155', fontStyle: 'italic' }}>
              "Whatever you do, work at it with all your heart, as working for the Lord." — Col 3:23
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map((l) => (
                <a key={l} href="#" style={{ fontSize: 12, color: '#475569', textDecoration: 'none' }}>{l}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
