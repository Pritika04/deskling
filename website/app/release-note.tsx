"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { announcement } from "../lib/announcement";

export default function ReleaseNote() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return <div ref={root} className="release-note" onPointerEnter={event => { if (event.pointerType === "mouse") setOpen(true); }} onPointerLeave={event => { if (event.pointerType === "mouse" && !event.currentTarget.contains(document.activeElement)) setOpen(false); }} onFocus={() => setOpen(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}>
    <button type="button" className="release-note-pill" aria-expanded={open} aria-controls="release-note-content" onClick={() => setOpen(true)}><span className="release-dot" aria-hidden="true" />{announcement.label}</button>
    <div id="release-note-content" className="release-note-card" hidden={!open}>
      <strong>{announcement.title}</strong>
      <p>{announcement.description}</p>
      <a href={announcement.href}>{announcement.linkLabel}<ArrowRight size={13} aria-hidden="true" /></a>
    </div>
  </div>;
}
