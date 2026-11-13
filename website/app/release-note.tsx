import { ArrowRight, ChevronDown } from "lucide-react";
import { announcement } from "../lib/announcement";

export default function ReleaseNote() {
  return <details className="release-note">
    <summary><span className="release-dot" aria-hidden="true" />{announcement.label}<ChevronDown size={12} aria-hidden="true" /></summary>
    <div className="release-note-card">
      <strong>{announcement.title}</strong>
      <p>{announcement.description}</p>
      <a href={announcement.href}>{announcement.linkLabel}<ArrowRight size={13} aria-hidden="true" /></a>
    </div>
  </details>;
}
