"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/#about",      label: "About" },
  { href: "/#why-join",   label: "Why Join" },
  { href: "/#events",     label: "Events" },
  { href: "/tee-times",   label: "Find Tee Times" },
  { href: "/#membership", label: "Membership" },
];

export default function SiteNav() {
  const [open, setOpen] = useState(false);

  // Close menu on route change / resize
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/" className="nav-logo" onClick={() => setOpen(false)}>
            The Fairway Society
          </Link>

          {/* Desktop links */}
          <ul className="nav-links">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href}>{l.label}</Link>
              </li>
            ))}
          </ul>

          {/* Hamburger button (mobile only) */}
          <button
            className="hamburger"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className={`ham-line ${open ? "ham-line-1-open" : ""}`} />
            <span className={`ham-line ${open ? "ham-line-2-open" : ""}`} />
            <span className={`ham-line ${open ? "ham-line-3-open" : ""}`} />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div
        className={`mobile-drawer ${open ? "mobile-drawer-open" : ""}`}
        aria-hidden={!open}
      >
        <ul className="mobile-links">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Backdrop */}
      {open && (
        <div className="drawer-backdrop" onClick={() => setOpen(false)} />
      )}

      <style jsx>{`
        /* ── Hamburger button ─────────────────────────────────────────────── */
        .hamburger {
          display: none;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 5px;
          width: 40px;
          height: 40px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          z-index: 1100;
          flex-shrink: 0;
        }
        .ham-line {
          display: block;
          width: 22px;
          height: 2px;
          background: var(--cream);
          border-radius: 2px;
          transition: transform 0.3s ease, opacity 0.3s ease;
          transform-origin: center;
        }
        .ham-line-1-open { transform: translateY(7px) rotate(45deg); }
        .ham-line-2-open { opacity: 0; transform: scaleX(0); }
        .ham-line-3-open { transform: translateY(-7px) rotate(-45deg); }

        /* ── Mobile drawer ────────────────────────────────────────────────── */
        .mobile-drawer {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 280px;
          max-width: 85vw;
          background: var(--green-dark);
          z-index: 1050;
          transform: translateX(100%);
          transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          padding: 6rem 2rem 2rem;
          overflow-y: auto;
        }
        .mobile-drawer-open { transform: translateX(0); }

        .mobile-links {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .mobile-links li {
          border-bottom: 1px solid rgba(184, 150, 78, 0.2);
        }
        .mobile-links li:first-child {
          border-top: 1px solid rgba(184, 150, 78, 0.2);
        }
        .mobile-links a {
          display: block;
          padding: 1.1rem 0;
          color: var(--cream);
          font-family: "Montserrat", sans-serif;
          font-size: 0.85rem;
          font-weight: 500;
          letter-spacing: 2px;
          text-transform: uppercase;
          transition: color 0.2s;
        }
        .mobile-links a:hover { color: var(--gold); }

        /* ── Backdrop ─────────────────────────────────────────────────────── */
        .drawer-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1040;
          backdrop-filter: blur(2px);
        }

        /* ── Responsive ───────────────────────────────────────────────────── */
        @media (max-width: 768px) {
          .hamburger { display: flex; }
          /* Hide desktop links on mobile via globals.css override */
        }
      `}</style>

      {/* Global style to hide desktop nav links on mobile */}
      <style jsx global>{`
        @media (max-width: 768px) {
          .nav-links { display: none !important; }
          .nav { padding: 0.875rem 1.25rem; }
          .nav-logo { font-size: 1.1rem; }
        }
      `}</style>
    </>
  );
}
