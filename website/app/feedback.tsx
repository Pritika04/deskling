"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Heart, MessageCircle, X } from "lucide-react";

const categories = { bug: "A bug", idea: "An idea", other: "Something else" } as const;
type Category = keyof typeof categories;
// Formspree form IDs are public. Allow an environment override for another inbox.
const formId = process.env.NEXT_PUBLIC_FORMSPREE_FORM_ID?.trim() || "xkjrwjnp";
const configured = /^[a-zA-Z0-9]{6,64}$/.test(formId);

export default function Feedback() {
  const dialog = useRef<HTMLDialogElement>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const [category, setCategory] = useState<Category>("other");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  function open() {
    if (status === "sent") setStatus("idle");
    dialog.current?.showModal();
    messageInput.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!configured) {
      setError("Our feedback inbox is taking a little break. Please try again soon.");
      setStatus("error");
      return;
    }
    if (!message.trim()) {
      setError("Add a little message before sending.");
      setStatus("error");
      messageInput.current?.focus();
      return;
    }
    const data = new FormData(event.currentTarget);
    const payload = {
      _subject: `Deskling feedback: ${categories[category]}`,
      category: categories[category],
      message: message.trim(),
      ...(email.trim() ? { email: email.trim() } : {}),
      _gotcha: String(data.get("_gotcha") || ""),
    };
    submitting.current = true;
    setError("");
    setStatus("sending");
    try {
      const response = await fetch(`https://formspree.io/f/${formId}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        credentials: "omit",
        referrerPolicy: "origin",
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result || typeof result !== "object" || result.ok === false || result.errors?.length) {
        throw new Error(response.status === 429 ? "busy" : "delivery");
      }
      setStatus("sent");
      setMessage("");
      setEmail("");
      setCategory("other");
    } catch (failure) {
      setError(failure instanceof Error && failure.message === "busy"
        ? "Our inbox is a little busy. Please try again in a moment. Your message is still here."
        : "Your note couldn’t be sent just yet. Please try again. Your message is still here.");
      setStatus("error");
    } finally {
      submitting.current = false;
    }
  }

  const sending = status === "sending";
  return <section className="feedback-section wrap" id="feedback" aria-labelledby="feedback-heading">
    <div className="feedback-card">
      <div className="feedback-mark" aria-hidden="true"><MessageCircle size={32} strokeWidth={1.2} /><Heart size={13} /></div>
      <div className="feedback-copy"><span className="eyebrow">A LITTLE NOTE CAN MAKE A BIG DIFFERENCE</span><h2 id="feedback-heading">Help Deskling grow.</h2><p>Found something confusing? Have a tiny wish?<br />A little feedback goes a long way.</p></div>
      <div className="feedback-action"><button className="button" type="button" onClick={open}>Leave feedback <ArrowRight size={16} /></button><span>No account. Email optional.</span></div>
    </div>
    <dialog ref={dialog} className="feedback-dialog" aria-labelledby="feedback-title" aria-describedby="feedback-intro" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="feedback-dialog-inner">
        <button type="button" className="feedback-close" aria-label="Close feedback form" onClick={() => dialog.current?.close()}><X size={19} /></button>
        {status === "sent" ? <div className="feedback-success" role="status">
          <span className="feedback-success-icon"><Check size={26} strokeWidth={1.5} /></span>
          <h3 id="feedback-title">Thanks for helping<br />Deskling grow ♡</h3>
          <p id="feedback-intro">Your note has been sent privately.<br />Every little thought helps.</p>
          <button type="button" className="button" onClick={() => dialog.current?.close()}>Back to Deskling <ArrowRight size={15} /></button>
        </div> : <>
          <span className="eyebrow">A LITTLE SPACE FOR YOUR THOUGHTS</span>
          <h3 id="feedback-title">What’s on your mind?</h3>
          <p id="feedback-intro">A bug, an idea, or a little note. All welcome.</p>
          <form onSubmit={submit}>
            <fieldset disabled={sending} className="feedback-categories"><legend>What kind of note?</legend><div>{(Object.entries(categories) as [Category, string][]).map(([value, label]) => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{label}</button>)}</div></fieldset>
            <label className="feedback-field" htmlFor="feedback-message">Your message <span>(required)</span></label>
            <textarea ref={messageInput} id="feedback-message" name="message" value={message} onChange={event => setMessage(event.target.value)} required maxLength={4000} rows={5} disabled={sending} placeholder="I’d love it if…" />
            <label className="feedback-field" htmlFor="feedback-email">Email <span>(optional)</span></label>
            <input id="feedback-email" name="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} disabled={sending} aria-describedby="feedback-email-help" placeholder="Only if you’d like a reply" />
            <p id="feedback-email-help" className="feedback-field-help">Leave it blank to send without your name or contact details.</p>
            <div className="feedback-honeypot" aria-hidden="true"><label htmlFor="feedback-extra">Leave this field empty</label><input id="feedback-extra" name="_gotcha" autoComplete="off" tabIndex={-1} /></div>
            {!configured && <p className="feedback-status" role="status">Our feedback inbox is taking a little break. Please try again soon.</p>}
            {error && <p className="feedback-error" role="alert">{error}</p>}
            <button className="button feedback-submit" type="submit" disabled={sending || !configured}>{sending ? "Sending your note…" : "Send a little note"}<ArrowRight size={15} /></button>
            <p className="feedback-privacy">Sent privately via Formspree. Your email is never required.</p>
          </form>
        </>}
      </div>
    </dialog>
  </section>;
}
