import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PlatformRole } from '@sbdmm/shared';
import { useAuth } from '../contexts/AuthContext';

function getRoleHome(role: PlatformRole): string {
  switch (role) {
    case 'vendor':
    case 'logistics_provider': return '/provider/dashboard';
    case 'tenant_admin':
    case 'super_admin': return '/admin';
    default: return '/dashboard';
  }
}

const steps = [
  { number: '01', icon: 'ph-camera', title: 'Show us your space', copy: 'Upload a room photo and share dimensions, style, material and budget.' },
  { number: '02', icon: 'ph-sparkle', title: 'Explore tailored concepts', copy: 'Receive three design directions shaped around your room and preferences.' },
  { number: '03', icon: 'ph-hammer', title: 'Build with confidence', copy: 'Compare verified craftspeople, approve a quote and follow every milestone.' },
];

const capabilities = [
  { icon: 'ph-magic-wand', title: 'AI-assisted design', copy: 'Move from an idea to a clear, buildable furniture brief in minutes.' },
  { icon: 'ph-seal-check', title: 'Verified makers', copy: 'Work with vetted carpenters and furniture specialists in your region.' },
  { icon: 'ph-arrows-left-right', title: 'Transparent trade', copy: 'Compare quotes, timelines and materials before committing.' },
  { icon: 'ph-package', title: 'Delivery visibility', copy: 'Track production and logistics through one connected workspace.' },
];

function Brand(): React.JSX.Element {
  return (
    <Link to="/" className="marketing-brand" aria-label="SBDMM home">
      <span className="marketing-brand__mark">S</span>
      <span><strong>SBDMM</strong><small>Furniture, made personal</small></span>
    </Link>
  );
}

export default function LandingPage(): React.JSX.Element {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated && profile?.role) {
      void navigate(getRoleHome(profile.role), { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, profile]);

  if (isLoading) {
    return <div className="marketing-loading"><span className="spinner-border" /></div>;
  }

  return (
    <div className="marketing-page">
      <header className="marketing-header">
        <div className="marketing-shell marketing-nav">
          <Brand />
          <nav className={menuOpen ? 'marketing-links is-open' : 'marketing-links'} aria-label="Primary navigation">
            <a href="#process" onClick={() => setMenuOpen(false)}>How it works</a>
            <a href="#platform" onClick={() => setMenuOpen(false)}>Platform</a>
            <a href="#makers" onClick={() => setMenuOpen(false)}>For makers</a>
          </nav>
          <div className="marketing-actions">
            <Link to="/login" className="button button--quiet">Sign in</Link>
            <Link to="/login" className="button button--primary">Start designing <i className="ph ph-arrow-up-right" /></Link>
            <button className="marketing-menu" onClick={() => setMenuOpen(value => !value)} aria-label="Toggle navigation" aria-expanded={menuOpen}>
              <i className={menuOpen ? 'ph ph-x' : 'ph ph-list'} />
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="marketing-hero">
          <div className="marketing-shell marketing-hero__grid">
            <div className="marketing-hero__copy">
              <span className="eyebrow"><i className="ph ph-sparkle" /> Design intelligence, human craft</span>
              <h1>Furniture that begins with <em>your space.</em></h1>
              <p>Turn a room photo into a personalised furniture concept, then bring it to life with a verified local craftsperson.</p>
              <div className="marketing-hero__actions">
                <Link to="/login" className="button button--primary button--large">Create your first design <i className="ph ph-arrow-right" /></Link>
                <a href="#process" className="button button--outline button--large"><i className="ph ph-play-circle" /> See how it works</a>
              </div>
              <div className="marketing-proof">
                <span><i className="ph-fill ph-check-circle" /> No design experience needed</span>
                <span><i className="ph-fill ph-check-circle" /> Clear quotes before you commit</span>
              </div>
            </div>

            <div className="concept-stage" aria-label="Example AI furniture concept">
              <div className="concept-stage__glow" />
              <div className="concept-card concept-card--main">
                <div className="concept-card__top"><span>Concept 02</span><span className="concept-status"><i className="ph-fill ph-circle" /> Ready to refine</span></div>
                <div className="concept-visual">
                  <div className="table-object"><span className="table-object__top" /><span className="table-object__leg table-object__leg--one" /><span className="table-object__leg table-object__leg--two" /></div>
                  <span className="concept-visual__label">Oak dining table · 6 seater</span>
                </div>
                <div className="concept-card__body">
                  <div><span className="meta-label">Material</span><strong>Natural oak</strong></div>
                  <div><span className="meta-label">Estimate</span><strong>R18k – R24k</strong></div>
                  <button aria-label="Open concept"><i className="ph ph-arrow-up-right" /></button>
                </div>
              </div>
              <div className="concept-card concept-card--note"><i className="ph ph-sparkle" /><span><strong>Room-aware design</strong><small>Balanced for your light, palette and proportions.</small></span></div>
              <div className="concept-card concept-card--maker"><span className="maker-avatar">TM</span><span><strong>Thabo Mokoena</strong><small>Verified carpenter · 4.9 rating</small></span><i className="ph-fill ph-seal-check" /></div>
            </div>
          </div>
        </section>

        <section className="trust-strip" aria-label="Platform highlights">
          <div className="marketing-shell trust-strip__grid">
            <div><strong>3</strong><span>concepts per brief</span></div>
            <div><strong>48h</strong><span>average maker response</span></div>
            <div><strong>500+</strong><span>verified craftspeople</span></div>
            <div><strong>98%</strong><span>customer satisfaction</span></div>
          </div>
        </section>

        <section id="process" className="marketing-section">
          <div className="marketing-shell">
            <div className="section-heading"><span className="eyebrow">A simpler way to commission furniture</span><h2>From room to workshop in three clear steps.</h2><p>One connected process replaces scattered inspiration boards, vague briefs and uncertain quotes.</p></div>
            <div className="process-grid">
              {steps.map(step => <article key={step.number} className="process-card"><span className="process-card__number">{step.number}</span><span className="process-card__icon"><i className={`ph ${step.icon}`} /></span><h3>{step.title}</h3><p>{step.copy}</p></article>)}
            </div>
          </div>
        </section>

        <section id="platform" className="marketing-section marketing-section--tint">
          <div className="marketing-shell platform-grid">
            <div className="platform-copy"><span className="eyebrow">Designed for real decisions</span><h2>Beautiful concepts. Practical next steps.</h2><p>SBDMM keeps design, procurement and delivery in one place, so customers and makers always know what happens next.</p><Link to="/login" className="text-link">Explore the platform <i className="ph ph-arrow-right" /></Link></div>
            <div className="capability-grid">{capabilities.map(item => <article key={item.title} className="capability-card"><i className={`ph ${item.icon}`} /><h3>{item.title}</h3><p>{item.copy}</p></article>)}</div>
          </div>
        </section>

        <section id="makers" className="marketing-section">
          <div className="marketing-shell maker-banner">
            <div><span className="eyebrow eyebrow--light">For furniture professionals</span><h2>Spend less time chasing leads. Build better briefs.</h2><p>Receive qualified requests with clear dimensions, style direction and budget expectations.</p></div>
            <Link to="/login" className="button button--light button--large">Join as a maker <i className="ph ph-arrow-right" /></Link>
          </div>
        </section>

        <section className="marketing-cta"><div className="marketing-shell"><span className="eyebrow">Your next piece starts here</span><h2>Make the room feel like yours.</h2><p>Create a thoughtful brief in minutes and meet the craftsperson who can build it.</p><Link to="/login" className="button button--primary button--large">Start designing for free <i className="ph ph-arrow-right" /></Link></div></section>
      </main>

      <footer className="marketing-footer"><div className="marketing-shell marketing-footer__grid"><Brand /><p>AI-assisted furniture design and transparent local manufacturing.</p><div><Link to="/login">Sign in</Link><Link to="/login">Create account</Link><a href="mailto:hello@sbdmm.com">Contact</a></div><small>© {new Date().getFullYear()} SBDMM</small></div></footer>
    </div>
  );
}
