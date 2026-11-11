import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Gamepad2, Gift, Heart, Laptop, Sparkles, WandSparkles } from "lucide-react";
import art from "../../lib/buddy-art.json";

export const metadata: Metadata = {
  title: "What’s next for Deskling — Upcoming features",
  description: "A little peek at Deskling’s plans: smoother Mac and Linux experiences, more accessories, and ideas for games, playful power-ups and new buddies. Share what you’d love next.",
  alternates: { canonical: "/upcoming" },
  openGraph: { title: "A little peek at what’s next for Deskling", description: "Plans, possibilities, and little ideas for your desktop buddy.", url: "/upcoming", type: "website", images: ["/social.png"] },
  twitter: { card: "summary_large_image", title: "What’s next for Deskling", description: "Plans, possibilities, and little ideas for your desktop buddy.", images: ["/social.png"] },
};

const planned = [
  { title: "More places to feel at home", description: "Polish the Mac and Linux betas with feedback from real computers: smoother installation, better desktop behavior, and fewer little hiccups.", Icon: Laptop },
  { title: "A little more dress-up", description: "More cute accessories to save your coins for, with outfits that make your buddy feel a little more like yours.", Icon: Gift },
];
const exploring = [
  { title: "Little games, together", description: "A small play break with your buddy. Something quick, sweet, and easy to step away from when it’s time to focus again.", Icon: Gamepad2 },
  { title: "A sprinkle of magic", description: "Playful power-ups you could unlock with coins: a little extra sparkle, a new animation, or a fun way to play together.", Icon: WandSparkles },
  { title: "New little faces", description: "More buddies to meet and unlock. We’re also exploring an optional daily surprise buddy, with your favorite always there to switch back to.", Icon: Sparkles },
];

function Brand() {
  return <Link href="/" className="wordmark" aria-label="Deskling home"><svg viewBox="0 0 100 100" className="buddy" aria-hidden="true"><ellipse cx="50" cy="92" rx="27" ry="3" fill="#43583a" opacity=".09" /><g dangerouslySetInnerHTML={{ __html: art.plant.plain }} /></svg><span>deskling<span className="logo-dot">.</span></span></Link>;
}

export default function Upcoming() {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><Brand /><nav aria-label="Main navigation"><Link href="/">Home</Link><Link href="/upcoming" aria-current="page">Upcoming</Link><Link href="/#feedback">Leave a little note</Link></nav><Link className="button nav-download" href="/#downloads">Get Deskling <ArrowRight size={15} aria-hidden="true" /></Link></header>
    <main id="main" className="upcoming-page wrap">
      <Link className="upcoming-back" href="/"><ArrowLeft size={15} aria-hidden="true" /> Back to our little corner</Link>
      <div className="upcoming-intro"><span className="eyebrow">A LITTLE SOMETHING TO LOOK FORWARD TO</span><h1>Small ideas.<br /><em>Lovely possibilities.</em></h1><p>Deskling is still growing. Here’s a peek at what we’d love to bring to your buddy’s little world.</p><span className="upcoming-note">A direction, not a deadline. Plans may change as we learn what feels right.</span></div>
      <section className="upcoming-group" aria-labelledby="planned-heading"><div className="upcoming-group-heading"><span className="upcoming-status">Planned</span><h2 id="planned-heading">The next little steps.</h2><p>Things we want to focus on next.</p></div><div className="upcoming-grid">{planned.map(({ title, description, Icon }) => <article className="upcoming-card" key={title}><Icon size={25} strokeWidth={1.3} aria-hidden="true" /><h3>{title}</h3><p>{description}</p></article>)}</div></section>
      <section className="upcoming-group" aria-labelledby="exploring-heading"><div className="upcoming-group-heading"><span className="upcoming-status exploring">Exploring</span><h2 id="exploring-heading">What if we…?</h2><p>Ideas we’re playing with. Tell us which ones make you smile.</p></div><div className="upcoming-grid exploring-grid">{exploring.map(({ title, description, Icon }) => <article className="upcoming-card" key={title}><Icon size={25} strokeWidth={1.3} aria-hidden="true" /><h3>{title}</h3><p>{description}</p></article>)}</div></section>
      <section className="upcoming-invitation" aria-labelledby="idea-heading"><Heart size={25} strokeWidth={1.3} aria-hidden="true" /><h2 id="idea-heading">Got a tiny wish?</h2><p>Something you’d love to see? A small thing that would make your day?<br />Your notes help shape what Deskling becomes.</p><Link className="button" href="/#feedback">Share an idea <ArrowRight size={16} aria-hidden="true" /></Link><span>No account. Email optional.</span></section>
    </main>
    <footer className="wrap"><Brand /><span>Small steps. Lovely company.</span><nav aria-label="Footer navigation"><Link href="/">Home</Link><Link href="/upcoming" aria-current="page">Upcoming</Link><Link href="/#feedback">Feedback</Link></nav><small>© 2026 Deskling</small></footer>
  </>;
}
