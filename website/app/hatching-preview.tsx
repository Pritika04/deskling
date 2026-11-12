"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import art from "../lib/buddy-art.json";

function Egg({ cracked = false }: { cracked?: boolean }) {
  return <svg viewBox="0 0 100 100" className="hatch-egg" aria-hidden="true"><ellipse cx="50" cy="92" rx="25" ry="3" fill="#43583a" opacity=".08" /><path d="M22 63C22 40 35 15 50 15S78 40 78 63Q78 87 50 87T22 63Z" fill="#f3e6c8" stroke="#b6a27a" strokeWidth="2" /><path d="m36 41 4 2m23 17 3-2M37 70l3 1" stroke="#dbc89e" strokeWidth="5" strokeLinecap="round" />{cracked && <path d="m53 17-7 17 10 6-12 16 8 7-7 22" fill="none" stroke="#b6a27a" strokeWidth="2" />}<path d="M39 56v3m22-3v3m-16 8q5 4 10 0" fill="none" stroke="#716345" strokeWidth="2.5" strokeLinecap="round" /></svg>;
}
function Friend() {
  return <svg viewBox="0 0 100 100" className="buddy hatch-friend" aria-hidden="true"><ellipse cx="50" cy="92" rx="27" ry="3" fill="#43583a" opacity=".08" /><g dangerouslySetInnerHTML={{ __html: art.plant.plain }} /></svg>;
}

export default function HatchingPreview() {
  const container = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState("egg");
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const clear = () => { observer?.disconnect(); timers.forEach(clearTimeout); timers = []; };
    const watch = () => {
      clear();
      if (motion.matches || !container.current) return;
      observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer?.disconnect();
        setPhase("egg");
        timers = [setTimeout(() => setPhase("crack"), 1000), setTimeout(() => setPhase("buddy"), 2100), setTimeout(() => setPhase("name"), 3100)];
      }, { threshold: 0.5 });
      observer.observe(container.current);
    };
    watch(); motion.addEventListener("change", watch);
    return () => { clear(); motion.removeEventListener("change", watch); };
  }, [replay]);

  return <div className="ritual-art hatch-preview" ref={container} data-phase={phase}>
    <div className="hatch-stage" role="img" aria-label="On first launch, a little egg cracks, hatches into your buddy, and you give them a name.">
      <div className="hatch-shell"><Egg cracked={phase === "crack"} /></div>
      <div className="hatch-character"><Friend /><span className="hatch-name">hello, Miso ♡</span></div>
      <span className="hatch-caption" aria-hidden="true">{phase === "egg" ? "someone tiny is waiting" : phase === "crack" ? "a little crack…" : phase === "buddy" ? "hello, little friend" : "a name makes it yours"}</span>
    </div>
    <div className="hatch-still" role="img" aria-label="First launch: an egg, a cracked shell, then your buddy, named Miso."><div><Egg /><span>an egg</span></div><i aria-hidden="true">→</i><div><Egg cracked /><span>a little crack</span></div><i aria-hidden="true">→</i><div><Friend /><span>hello, Miso ♡</span></div></div>
    <button type="button" className="hatch-replay" onClick={() => { setPhase("egg"); setReplay(value => value + 1); }} aria-label="Replay buddy hatching preview"><RotateCcw size={11} aria-hidden="true" /> Replay</button>
  </div>;
}
