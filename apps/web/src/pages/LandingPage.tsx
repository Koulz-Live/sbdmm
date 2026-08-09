import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PlatformRole } from '@sbdmm/shared';
import { useAuth } from '../contexts/AuthContext';

type PublicRole = 'buyer' | 'artisan' | 'vendor';

function getRoleHome(role: PlatformRole): string {
  if (role === 'artisan') return '/artisan';
  if (role === 'vendor') return '/provider/dashboard';
  if (role === 'admin') return '/admin';
  return '/dashboard';
}

const journeys: Array<{
  role: PublicRole;
  label: string;
  eyebrow: string;
  title: string;
  copy: string;
  icon: string;
  action: string;
  features: string[];
}> = [
  {
    role: 'buyer', label: 'For buyers', eyebrow: 'Imagine it', icon: 'ph-cube-focus',
    title: 'Design furniture for your actual room.',
    copy: 'Upload a room or kitchen photo, shape an AI concept, and place a build order with a highly rated local artisan.',
    action: 'Start a design',
    features: ['Room-aware AI concepts', 'Upfront design and build brief', 'Milestone order tracking'],
  },
  {
    role: 'artisan', label: 'For artisans', eyebrow: 'Build it', icon: 'ph-hammer',
    title: 'Turn qualified designs into production jobs.',
    copy: 'Accept nearby work, refine the AI-generated bill of materials, choose sourcing, and track each job from workshop to handover.',
    action: 'Join as an artisan',
    features: ['15-minute job offers', 'Editable AI-generated BOM', 'IFRS-ready job records'],
  },
  {
    role: 'vendor', label: 'For vendors', eyebrow: 'Supply it', icon: 'ph-storefront',
    title: 'Quote against real material demand.',
    copy: 'Review artisan supply requests and consolidated material demand, submit transparent quotes, and fulfil awarded orders.',
    action: 'Join as a vendor',
    features: ['Structured BOM requests', 'Consolidated demand visibility', 'Quote and award tracking'],
  },
];

const flow = [
  { icon: 'ph-sparkle', title: 'AI creates the design', copy: 'The buyer approves a room-aware concept and converts it into an order.' },
  { icon: 'ph-file-text', title: 'A buildable BOM follows', copy: 'AI prepares the initial bill of materials before the job reaches a local artisan.' },
  { icon: 'ph-timer', title: 'Top artisans respond', copy: 'Each matched artisan has 15 minutes to accept before the offer moves on.' },
  { icon: 'ph-handshake', title: 'Sourcing gets decided', copy: 'The artisan buys materials directly or requests competitive vendor quotations.' },
];

function roleHref(role: PublicRole): string {
  return `/login?role=${role}`;
}

function Brand(): React.JSX.Element {
  return (
    <Link to="/" className="marketing-brand" aria-label="SBDMM home">
      <span className="marketing-brand__mark">S</span>
      <span><strong>SBDMM</strong><small>Design · Make · Supply</small></span>
    </Link>
  );
}

export default function LandingPage(): React.JSX.Element {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeRole, setActiveRole] = useState<PublicRole>('buyer');
  const selected = journeys.find(item => item.role === activeRole)!;

  useEffect(() => {
    if (!isLoading && isAuthenticated && profile?.role) void navigate(getRoleHome(profile.role), { replace: true });
  }, [isAuthenticated, isLoading, navigate, profile]);

  if (isLoading) return <div className="marketing-loading"><span className="spinner-border" /></div>;

  return (
    <div className="marketing-page">
      <header className="marketing-header">
        <div className="marketing-shell marketing-nav">
          <Brand />
          <nav className={menuOpen ? 'marketing-links is-open' : 'marketing-links'} aria-label="Primary navigation">
            <a href="#roles" onClick={() => setMenuOpen(false)}>Who it&apos;s for</a>
            <a href="#workflow" onClick={() => setMenuOpen(false)}>How it works</a>
            <a href="#trust" onClick={() => setMenuOpen(false)}>Why SBDMM</a>
          </nav>
          <div className="marketing-actions">
            <Link to="/login" className="button button--quiet">Sign in</Link>
            <Link to={roleHref(activeRole)} className="button button--primary">Get started <i className="ph ph-arrow-up-right" /></Link>
            <button className="marketing-menu" onClick={() => setMenuOpen(value => !value)} aria-label="Toggle navigation" aria-expanded={menuOpen}>
              <i className={menuOpen ? 'ph ph-x' : 'ph ph-list'} />
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="marketing-hero marketing-hero--ecosystem">
          <div className="marketing-shell marketing-hero__grid">
            <div className="marketing-hero__copy">
              <span className="eyebrow"><i className="ph ph-sparkle" /> One connected furniture marketplace</span>
              <h1>Designed by you.<br /><em>Built together.</em></h1>
              <p>SBDMM connects buyers, skilled artisans, and material vendors in one accountable journey—from a room photo to a finished piece.</p>
              <div className="role-tabs" role="tablist" aria-label="Choose your SBDMM journey">
                {journeys.map(item => (
                  <button key={item.role} type="button" role="tab" aria-selected={activeRole === item.role} className={activeRole === item.role ? 'role-tab is-active' : 'role-tab'} onClick={() => setActiveRole(item.role)}>
                    <i className={`ph ${item.icon}`} /> {item.label}
                  </button>
                ))}
              </div>
              <div className="marketing-hero__actions">
                <Link to={roleHref(activeRole)} className="button button--primary button--large">{selected.action} <i className="ph ph-arrow-right" /></Link>
                <a href="#workflow" className="button button--outline button--large">See the full journey</a>
              </div>
              <div className="marketing-proof">
                <span><i className="ph-fill ph-check-circle" /> Verified marketplace participants</span>
                <span><i className="ph-fill ph-check-circle" /> One secure account</span>
              </div>
            </div>

            <div className={`ecosystem-stage ecosystem-stage--${activeRole}`} aria-live="polite">
              <div className="ecosystem-stage__top"><span>{selected.eyebrow}</span><span className="ecosystem-live"><i className="ph-fill ph-circle" /> Connected workflow</span></div>
              <div className="ecosystem-stage__icon"><i className={`ph ${selected.icon}`} /></div>
              <span className="eyebrow">{selected.label}</span>
              <h2>{selected.title}</h2>
              <p>{selected.copy}</p>
              <ul>{selected.features.map(feature => <li key={feature}><i className="ph ph-check" />{feature}</li>)}</ul>
              <div className="ecosystem-stage__handoff">
                {journeys.map(item => <span key={item.role} className={item.role === activeRole ? 'is-active' : ''}><i className={`ph ${item.icon}`} />{item.role}</span>)}
              </div>
            </div>
          </div>
        </section>

        <section id="roles" className="marketing-section role-section">
          <div className="marketing-shell">
            <div className="section-heading"><span className="eyebrow">Three groups, one source of truth</span><h2>A focused workspace for every part of the job.</h2><p>Each account sees the actions, records, and decisions relevant to its role—without losing the shared project context.</p></div>
            <div className="role-card-grid">
              {journeys.map((item, index) => (
                <article key={item.role} className={`role-card role-card--${item.role}`}>
                  <div className="role-card__head"><span className="role-card__number">0{index + 1}</span><span className="role-card__icon"><i className={`ph ${item.icon}`} /></span></div>
                  <span className="eyebrow">{item.eyebrow}</span><h3>{item.label}</h3><p>{item.copy}</p>
                  <ul>{item.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
                  <Link to={roleHref(item.role)}>{item.action} <i className="ph ph-arrow-up-right" /></Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="marketing-section marketing-section--tint">
          <div className="marketing-shell workflow-layout">
            <div className="workflow-intro"><span className="eyebrow">From idea to installation</span><h2>Every handoff stays visible.</h2><p>The design, production job, BOM, sourcing decision, quotation, and financial events stay connected—so nobody works from an outdated brief.</p><Link to={roleHref('buyer')} className="text-link">Create a buyer account <i className="ph ph-arrow-right" /></Link></div>
            <ol className="workflow-list">{flow.map((item, index) => <li key={item.title}><span>{index + 1}</span><i className={`ph ${item.icon}`} /><div><h3>{item.title}</h3><p>{item.copy}</p></div></li>)}</ol>
          </div>
        </section>

        <section id="trust" className="marketing-section">
          <div className="marketing-shell trust-panel">
            <div><span className="eyebrow eyebrow--light">Designed for accountable trade</span><h2>Clear decisions before money moves.</h2><p>Artisans confirm the final job and choose their material sourcing route before payment. Vendors quote against versioned BOM data. Buyers follow the result through one order timeline.</p></div>
            <div className="trust-panel__facts">
              <span><strong>15 min</strong><small>per artisan job offer</small></span>
              <span><strong>AI + human</strong><small>BOM generation and approval</small></span>
              <span><strong>IFRS-ready</strong><small>artisan financial event trail</small></span>
            </div>
          </div>
        </section>

        <section className="marketing-cta"><div className="marketing-shell"><span className="eyebrow">Choose your place in the workflow</span><h2>Design it. Build it. Supply it.</h2><p>Use one secure SBDMM account to enter the workspace made for your role.</p><div className="cta-role-links">{journeys.map(item => <Link key={item.role} to={roleHref(item.role)} className={item.role === 'buyer' ? 'button button--primary button--large' : 'button button--outline button--large'}>{item.label} <i className="ph ph-arrow-right" /></Link>)}</div></div></section>
      </main>

      <footer className="marketing-footer"><div className="marketing-shell marketing-footer__grid"><Brand /><p>AI-assisted design, local manufacturing, and transparent material supply.</p><div><a href="#roles">User groups</a><a href="#workflow">Workflow</a><Link to="/login">Sign in</Link></div><small>© {new Date().getFullYear()} SBDMM</small></div></footer>
    </div>
  );
}
