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

const SERVICE_MODES = [
  { icon: 'ph-container',  label: 'FCL',     desc: 'Full Container Load' },
  { icon: 'ph-package',    label: 'LCL',     desc: 'Less Container Load' },
  { icon: 'ph-airplane',   label: 'Air',     desc: 'Express Air Freight' },
  { icon: 'ph-truck',      label: 'Road',    desc: 'Road Haulage' },
  { icon: 'ph-train',      label: 'Rail',    desc: 'Rail Freight' },
  { icon: 'ph-lightning',  label: 'Courier', desc: 'Courier & Express' },
  { icon: 'ph-anchor',     label: 'Project', desc: 'Project Cargo' },
  { icon: 'ph-warehouse',  label: 'Storage', desc: 'Bonded Warehousing' },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: 'ph-user-plus',
    title: 'Create your account',
    desc: 'Sign up as a buyer or logistics provider. Your workspace is isolated by tenant — your data stays yours.',
  },
  {
    step: '02',
    icon: 'ph-storefront',
    title: 'Browse vendor catalogues',
    desc: 'Explore FCL, LCL, air and road services from vetted logistics providers with transparent pricing.',
  },
  {
    step: '03',
    icon: 'ph-paper-plane-tilt',
    title: 'Request & compare quotes',
    desc: 'Send RFQs to multiple providers, compare responses side-by-side, and accept in one click.',
  },
  {
    step: '04',
    icon: 'ph-shield-check',
    title: 'Automated compliance checks',
    desc: 'Every vendor is assessed against trade compliance rules before you can award them a shipment.',
  },
];

const STATS = [
  { value: '500+', label: 'Logistics Providers' },
  { value: '12K+', label: 'Shipments Managed' },
  { value: '98%',  label: 'On-Time Delivery' },
  { value: '40+',  label: 'Countries Covered' },
];

const TESTIMONIALS = [
  {
    quote: 'SBDMM cut our freight procurement cycle from three weeks to three days. The compliance engine alone saved us months of manual checks.',
    name: 'Sarah Chen',
    title: 'Head of Supply Chain, TechFlow Asia',
    initials: 'SC',
    color: '#299E60',
  },
  {
    quote: 'As a freight forwarder, the vendor catalogue lets us showcase our lane expertise to buyers who would never have found us otherwise.',
    name: 'Marcus Adeyemi',
    title: 'Director, FastLane Logistics Nigeria',
    initials: 'MA',
    color: '#1d4ed8',
  },
  {
    quote: 'The RFQ workflow is genuinely seamless. We compare six carriers in one screen, not six email threads.',
    name: 'Priya Nair',
    title: 'Procurement Manager, GlobalMed',
    initials: 'PN',
    color: '#7e22ce',
  },
];

const NAV_LINKS = [
  { label: 'Features',     href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Vendors',      href: '#vendors' },
  { label: 'Contact',      href: '#contact' },
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
                <i className="ph ph-globe-hemisphere-west" /> Global Trade &amp; Logistics Platform
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
                Smarter Freight{' '}
                <span style={{ color: '#299E60' }}>Procurement</span>,{' '}
                Built for Global Trade.
              </h1>

              <p style={{ fontSize: 16, color: '#94a3b8', lineHeight: 1.7, marginBottom: 32, maxWidth: 500 }}>
                Connect with vetted logistics providers, compare live quotes, automate
                compliance checks, and manage every shipment from one workspace.
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
                  Start for Free <i className="ph ph-arrow-right" />
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
                {['No credit card required', 'SOC 2 Type II ready', 'GDPR compliant'].map((t) => (
                  <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ph ph-check-circle" style={{ color: '#299E60', fontSize: 16 }} />
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Platform mockup — hidden on mobile to avoid overflow */}
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
                      flex: 1,
                      height: 28,
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.06)',
                      marginLeft: 8,
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 12,
                      fontSize: 11,
                      color: '#475569',
                    }}
                  >
                    sbdmm.vercel.app/dashboard
                  </span>
                </div>

                {/* Mini dashboard */}
                <div style={{ background: '#f1f5f9', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', height: 240 }}>
                    <div
                      style={{
                        width: 48,
                        background: '#1e293b',
                        padding: '12px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                        alignItems: 'center',
                      }}
                    >
                      {['ph-squares-four', 'ph-package', 'ph-storefront', 'ph-file-text', 'ph-shield-check'].map((ic) => (
                        <i key={ic} className={`ph ${ic}`} style={{ fontSize: 18, color: '#64748b' }} />
                      ))}
                    </div>
                    <div style={{ flex: 1, padding: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        {[
                          { label: 'Active Vendors', val: '24',  color: '#299E60' },
                          { label: 'Open Quotes',    val: '8',   color: '#1d4ed8' },
                          { label: 'In Transit',     val: '31',  color: '#7e22ce' },
                          { label: 'Compliance OK',  val: '96%', color: '#0f766e' },
                        ].map((s) => (
                          <div key={s.label} style={{ background: '#fff', borderRadius: 8, padding: 10, borderLeft: `3px solid ${s.color}` }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.val}</div>
                            <div style={{ fontSize: 10, color: '#64748b' }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          style={{
                            background: '#fff',
                            borderRadius: 6,
                            height: 28,
                            marginBottom: 6,
                            padding: '0 10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: i === 1 ? '#299E60' : i === 2 ? '#f59e0b' : '#3b82f6', flexShrink: 0 }} />
                          <span style={{ height: 8, borderRadius: 4, background: '#e2e8f0', flex: 1 }} />
                          <span style={{ height: 8, borderRadius: 4, background: '#e2e8f0', width: 40 }} />
                        </div>
                      ))}
                    </div>
                  </div>
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

      {/* ── Service modes ──────────────────────────────────────────────── */}
      <section id="features" style={{ padding: '72px 0', background: '#fff' }}>
        <div className="container">
          <div className="text-center" style={{ marginBottom: 48 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#299E60', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Service Modes
            </span>
            <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', fontWeight: 800, color: '#1e293b', marginTop: 8 }}>
              Every mode of transport, one platform
            </h2>
            <p style={{ fontSize: 15, color: '#64748b', maxWidth: 540, margin: '12px auto 0' }}>
              From 40HQ containers to next-day courier — SBDMM connects you with
              specialists across all freight modes.
            </p>
          </div>

          <div className="row g-3">
            {SERVICE_MODES.map((m) => (
              <div key={m.label} className="col-6 col-sm-4 col-lg-3">
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 16,
                    padding: '28px 12px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    height: '100%',
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
                  <i className={`ph ${m.icon}`} style={{ fontSize: 36, color: '#299E60', display: 'block', marginBottom: 10 }} />
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{m.desc}</div>
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
              From RFQ to shipment in four steps
            </h2>
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
                Built for the complexity of global trade
              </h2>
              {[
                { icon: 'ph-shield-check', title: 'Automated Compliance',  desc: 'Every vendor passes a multi-point trade compliance check — sanctions screening, AML, and document validation — before you can award them a booking.' },
                { icon: 'ph-chart-bar',    title: 'Live Quote Comparison', desc: 'Receive structured quotes from multiple carriers on a single screen. Compare on price, transit time, and service mode — not PDFs in your inbox.' },
                { icon: 'ph-lock-simple',  title: 'Tenant Isolation',      desc: 'Your vendor relationships, orders, and documents are strictly isolated by tenant. Row-level security enforced at the database layer.' },
                { icon: 'ph-files',        title: 'Document Management',   desc: 'Centralise Bills of Lading, packing lists, and certificates of origin. Linked to the shipment they belong to.' },
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
                  { icon: 'ph-globe',          title: '40+ Countries',       sub: 'Logistics network coverage',       color: '#eff6ff', iconColor: '#1d4ed8' },
                  { icon: 'ph-clock-countdown', title: 'Real-time Updates',   sub: 'Live shipment tracking',           color: '#fdf4ff', iconColor: '#7e22ce' },
                  { icon: 'ph-currency-dollar', title: 'FX-Aware Pricing',    sub: 'Multi-currency quotes',            color: '#fff7ed', iconColor: '#c2410c' },
                  { icon: 'ph-bell-ringing',    title: 'Smart Alerts',        sub: 'Compliance & delay notifications', color: '#f0fdfa', iconColor: '#0f766e' },
                  { icon: 'ph-users-three',     title: 'Team Roles',          sub: 'Buyer, vendor, admin access',      color: '#fefce8', iconColor: '#a16207' },
                  { icon: 'ph-chart-line-up',   title: 'Analytics',           sub: 'Spend & performance insights',     color: '#f0fdf4', iconColor: '#15803d' },
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
              Trusted by logistics teams worldwide
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
            Ready to modernise your freight procurement?
          </h2>
          <p style={{ fontSize: 16, color: '#94a3b8', maxWidth: 520, margin: '0 auto 36px' }}>
            Join hundreds of trade teams already using SBDMM to move goods faster, smarter, and with full compliance confidence.
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
              Get started free <i className="ph ph-arrow-right" />
            </Link>
            <a
              href="#contact"
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
              <i className="ph ph-chats" /> Talk to sales
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
              <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, maxWidth: 280, marginBottom: 20 }}>
                A multi-tenant trade and logistics management platform. Helping global trade teams procure freight smarter.
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
              {['Dashboard', 'Orders', 'Vendors', 'Quotes', 'Documents', 'Compliance'].map((l) => (
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
