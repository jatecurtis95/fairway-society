import Link from "next/link";

export default function SiteNav() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-logo">The Fairway Society</Link>
        <ul className="nav-links">
          <li><Link href="/#about">About</Link></li>
          <li><Link href="/#features">Why Join</Link></li>
          <li><Link href="/#events">Events</Link></li>
          <li><Link href="/tee-times">Find Tee Times</Link></li>
          <li><Link href="/#membership">Membership</Link></li>
        </ul>
      </div>
    </nav>
  );
}
