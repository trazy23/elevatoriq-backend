import { useState, useEffect, useCallback, useRef } from "react";

// ElevatorIQ — Production Landing Page v6
// Changes from v5: Review type dropdown, multi-document upload,
// document tagging, updated processing overlay, Module C added to sample output

const C = {
  ink: "#0B0E13",
  inkLight: "#12161E",
  inkMid: "#1A1F2A",
  inkSoft: "#222836",
  accent: "#00B876",
  accentHover: "#00CC84",
  accentDim: "rgba(0, 184, 118, 0.10)",
  accentSubtle: "rgba(0, 184, 118, 0.06)",
  white: "#FFFFFF",
  offWhite: "#F5F6F8",
  gray50: "#E8EAF0",
  gray100: "#D0D4DC",
  gray300: "#9AA0AE",
  gray400: "#7C8290",
  gray500: "#5E6470",
  gray600: "#3E4452",
  risk: "#E85D5D",
  caution: "#E8A840",
  clear: "#00B876",
  blurOverlay: "rgba(11, 14, 19, 0.85)",
  focusRing: "rgba(0, 184, 118, 0.5)",
};

const font = "'DM Sans', sans-serif";
const mono = "'DM Mono', monospace";
const ACCEPTED_EXT = ".pdf,.doc,.docx";
const ACCEPTED_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_FILES = 4;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const API_BASE = "https://api.elevatoriq.ai:3001";
const FORMSPREE_ID = "xnjbvrpr";

const REVIEW_TYPES = [
  { value: "invoice_review", label: "Invoice Review", desc: "Find billing discrepancies vs. your contract" },
  { value: "maintenance_bid_comparison", label: "Maintenance Bid Comparison", desc: "Compare 2–4 maintenance proposals side by side" },
  { value: "modernization_comparison", label: "Modernization Bid Comparison", desc: "Compare 2–4 modernization or new construction bids" },
  { value: "single_modernization", label: "Single Modernization Bid Review", desc: "Scope and commercial review of one bid" },
  { value: "contract_coverage", label: "Contract Coverage Summary", desc: "Map what's covered, excluded, and ambiguous" },
];

const DOC_TAGS = ["Contract", "Invoice", "Proposal", "Callback Log", "Equipment List", "Other"];

const FOCUS_STYLE_ID = "eiq-focus";
function injectFocusStyles() {
  if (document.getElementById(FOCUS_STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = FOCUS_STYLE_ID;
  s.textContent = `.eiq-btn:focus-visible{outline:2px solid ${C.focusRing};outline-offset:2px}.eiq-input:focus-visible{border-color:${C.accent}!important;outline:none}`;
  document.head.appendChild(s);
}

// ─── Hooks ───
function useFadeIn(delay = 0) {
  const [v, setV] = useState(false);
  useEffect(() => { const t = setTimeout(() => setV(true), 80 + delay); return () => clearTimeout(t); }, [delay]);
  return { opacity: v ? 1 : 0, transform: v ? "translateY(0)" : "translateY(12px)", transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms` };
}

function useBreakpoint() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => { const h = () => setW(window.innerWidth); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return { mobile: w < 640, tablet: w < 900, w };
}

function useScrollLock(locked) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [locked]);
}

function useFocusTrap(active) {
  const ref = useRef(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    const get = () => el.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
    const f = get();
    if (f.length) f[0].focus();
    const handler = (e) => {
      if (e.key !== "Tab") return;
      const items = get();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [active]);
  return ref;
}

function useHover() {
  const [h, setH] = useState(false);
  return [h, { onMouseEnter: () => setH(true), onMouseLeave: () => setH(false) }];
}

// ─── Fade Wrappers ───
function FadeItem({ delay = 0, children, style = {} }) { const a = useFadeIn(delay); return <div style={{ ...a, ...style }}>{children}</div>; }
function FadeCard({ delay = 0, children, style = {} }) { const a = useFadeIn(delay); return <div style={{ ...a, ...style }}>{children}</div>; }

// ─── Scroll ───
function scrollTo(id) { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }

// ─── Logo ───
function LogoMark({ size = 28, color = C.accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="8" y="4" width="10" height="32" rx="2" fill={color} opacity="0.85" />
      <rect x="22" y="12" width="10" height="24" rx="2" fill={color} opacity="0.4" />
      <rect x="11" y="4" width="4" height="14" rx="1" fill={color} opacity="0.5" />
    </svg>
  );
}

function Logo() {
  return (
    <button className="eiq-btn" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="ElevatorIQ — back to top"
      style={{ display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
      <span style={{ fontFamily: font, fontSize: 19, fontWeight: 600, color: C.white, letterSpacing: "-0.03em" }}>
        Elevator<span style={{ color: C.accent }}>IQ</span>
      </span>
      <LogoMark size={22} />
    </button>
  );
}

// ─── Buttons ───
function PrimaryBtn({ children, onClick, disabled, style = {}, small = false }) {
  const [h, bind] = useHover();
  return (
    <button className="eiq-btn" onClick={onClick} disabled={disabled} {...bind} style={{
      background: disabled ? C.inkMid : h ? C.accentHover : C.accent,
      color: disabled ? C.gray400 : C.ink, border: "none",
      borderRadius: small ? 7 : 9, padding: small ? "9px 18px" : "13px 26px",
      fontSize: small ? 13 : 14.5, fontWeight: 600, fontFamily: font,
      cursor: disabled ? "not-allowed" : "pointer", letterSpacing: "-0.01em",
      transition: "background 0.15s ease, color 0.15s ease", ...style,
    }}>{children}</button>
  );
}

function GhostBtn({ children, onClick, style = {} }) {
  const [h, bind] = useHover();
  return (
    <button className="eiq-btn" onClick={onClick} {...bind} style={{
      background: h ? C.inkMid : "transparent", color: C.gray100,
      border: `1px solid ${C.inkMid}`, borderRadius: 9,
      padding: "13px 26px", fontSize: 14.5, fontWeight: 500, fontFamily: font,
      cursor: "pointer", transition: "background 0.15s ease", ...style,
    }}>{children}</button>
  );
}

// ─── Layout ───
function Section({ children, style = {}, border = false, id }) {
  return <section id={id} style={{ maxWidth: 860, margin: "0 auto", padding: "72px 28px", borderTop: border ? `1px solid ${C.inkMid}` : "none", ...style }}>{children}</section>;
}
function SectionLabel({ children }) {
  return <div style={{ fontFamily: mono, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: C.gray400, marginBottom: 20 }}>{children}</div>;
}
function SectionTitle({ children, center = false }) {
  return <h2 style={{ fontFamily: font, fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.2, color: C.white, margin: "0 0 16px 0", textAlign: center ? "center" : "left" }}>{children}</h2>;
}
function SectionDesc({ children, center = false, maxWidth = 520 }) {
  return <p style={{ fontFamily: font, fontSize: 15, color: C.gray300, lineHeight: 1.65, margin: center ? "0 auto" : 0, maxWidth, textAlign: center ? "center" : "left" }}>{children}</p>;
}
function StatusTag({ label, color }) {
  return <span style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 500, color, background: `${color}12`, padding: "3px 10px", borderRadius: 5, whiteSpace: "nowrap", letterSpacing: "0.01em" }}>{label}</span>;
}

// ─── NavLink ───
function NavLink({ label, targetId, hide }) {
  const [h, bind] = useHover();
  if (hide) return null;
  return (
    <button className="eiq-btn" onClick={() => scrollTo(targetId)} {...bind}
      style={{ fontSize: 13.5, color: h ? C.gray100 : C.gray400, cursor: "pointer", fontWeight: 500, fontFamily: font, background: "transparent", border: "none", padding: 0, transition: "color 0.15s ease" }}>
      {label}
    </button>
  );
}

// ─── File Validation ───
function validateFile(file) {
  if (!file) return "No file selected.";
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["pdf", "doc", "docx"].includes(ext) && !ACCEPTED_TYPES.includes(file.type)) return "Unsupported format. Please upload PDF, DOC, or DOCX.";
  if (file.size > MAX_FILE_SIZE) return `File exceeds 15 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`;
  return null;
}

// ─── Review Type Selector ───
function ReviewTypeSelector({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = REVIEW_TYPES.find(r => r.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <button className="eiq-btn" onClick={() => setOpen(o => !o)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        background: C.inkLight, border: `1px solid ${open ? C.accent + "60" : C.inkSoft}`,
        borderRadius: 10, padding: "13px 16px", cursor: "pointer", transition: "border-color 0.15s ease",
        textAlign: "left",
      }}>
        <div>
          {selected ? (
            <>
              <div style={{ fontFamily: font, fontSize: 14, fontWeight: 600, color: C.white, letterSpacing: "-0.01em" }}>{selected.label}</div>
              <div style={{ fontFamily: font, fontSize: 12, color: C.gray400, marginTop: 2 }}>{selected.desc}</div>
            </>
          ) : (
            <div style={{ fontFamily: font, fontSize: 14, color: C.gray500 }}>Select review type...</div>
          )}
        </div>
        <div style={{ color: C.gray400, fontSize: 12, marginLeft: 12, transition: "transform 0.2s ease", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▾</div>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
          background: C.inkLight, border: `1px solid ${C.inkSoft}`, borderRadius: 10,
          overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>
          {REVIEW_TYPES.map((rt, i) => (
            <button key={rt.value} className="eiq-btn" onClick={() => { onChange(rt.value); setOpen(false); }} style={{
              width: "100%", display: "block", padding: "12px 16px", textAlign: "left", cursor: "pointer",
              background: value === rt.value ? C.accentSubtle : "transparent",
              borderBottom: i < REVIEW_TYPES.length - 1 ? `1px solid ${C.inkMid}` : "none",
              border: "none", transition: "background 0.1s ease",
            }}
              onMouseEnter={e => { if (value !== rt.value) e.currentTarget.style.background = C.inkMid; }}
              onMouseLeave={e => { if (value !== rt.value) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ fontFamily: font, fontSize: 13.5, fontWeight: 600, color: value === rt.value ? C.accent : C.white, letterSpacing: "-0.01em" }}>{rt.label}</div>
              <div style={{ fontFamily: font, fontSize: 12, color: C.gray400, marginTop: 2 }}>{rt.desc}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Document Tag Selector (inline pill selector) ───
function DocTagSelector({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      {DOC_TAGS.map(tag => (
        <button key={tag} className="eiq-btn" onClick={() => onChange(value === tag ? null : tag)} style={{
          padding: "4px 10px", borderRadius: 6, fontSize: 11.5, fontFamily: font, fontWeight: 500,
          cursor: "pointer", transition: "all 0.15s ease",
          background: value === tag ? C.accentDim : C.inkMid,
          border: `1px solid ${value === tag ? C.accent + "50" : C.inkSoft}`,
          color: value === tag ? C.accent : C.gray400,
        }}>{tag}</button>
      ))}
    </div>
  );
}

// ─── Upload Panel (replaces single fileRef click) ───
function UploadPanel({ reviewType, onReviewTypeChange, files, onFilesChange, onSubmit, fileError }) {
  const { mobile } = useBreakpoint();
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback((incoming) => {
    const arr = Array.from(incoming);
    const remaining = MAX_FILES - files.length;
    const toAdd = arr.slice(0, remaining).map(f => ({
      file: f,
      error: validateFile(f),
      tag: null,
      id: Math.random().toString(36).slice(2),
    }));
    onFilesChange(prev => [...prev, ...toAdd]);
  }, [files.length, onFilesChange]);

  const onInputChange = (e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; };
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); };
  const removeFile = (id) => onFilesChange(prev => prev.filter(f => f.id !== id));
  const updateTag = (id, tag) => onFilesChange(prev => prev.map(f => f.id === id ? { ...f, tag } : f));

  const isComparison = ["maintenance_bid_comparison", "modernization_comparison"].includes(reviewType);
  const canUploadMore = files.length < MAX_FILES;
  const hasValidFiles = files.length > 0 && files.every(f => !f.error);
  const needsMoreFiles = isComparison && files.length < 2;
  const canSubmit = reviewType && hasValidFiles && !needsMoreFiles;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Step 1: Review Type */}
      <div>
        <div style={{ fontFamily: mono, fontSize: 10.5, color: C.gray400, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>01 — What do you want ElevatorIQ to do?</div>
        <ReviewTypeSelector value={reviewType} onChange={onReviewTypeChange} />
      </div>

      {/* Step 2: Upload */}
      <div>
        <div style={{ fontFamily: mono, fontSize: 10.5, color: C.gray400, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
          02 — Upload documents {isComparison ? "(2–4 files)" : "(1–4 files)"}
        </div>

        {canUploadMore && (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            style={{
              border: `2px dashed ${dragOver ? C.accent : C.inkSoft}`,
              borderRadius: 10, padding: "20px 16px", textAlign: "center", cursor: "pointer",
              background: dragOver ? C.accentSubtle : C.inkLight,
              transition: "all 0.15s ease",
            }}
          >
            <input ref={fileRef} type="file" accept={ACCEPTED_EXT} multiple onChange={onInputChange} style={{ display: "none" }} />
            <div style={{ fontFamily: font, fontSize: 13.5, color: C.gray300, marginBottom: 4 }}>
              Drop files here or <span style={{ color: C.accent, fontWeight: 600 }}>click to browse</span>
            </div>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.gray500 }}>
              PDF, DOC, DOCX · up to 15 MB each · {MAX_FILES - files.length} slot{MAX_FILES - files.length !== 1 ? "s" : ""} remaining
            </div>
          </div>
        )}

        {/* File list */}
        {files.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {files.map((item) => (
              <div key={item.id} style={{
                background: item.error ? "rgba(232,93,93,0.06)" : C.inkLight,
                border: `1px solid ${item.error ? C.risk + "40" : C.inkMid}`,
                borderRadius: 9, padding: "12px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                    <span style={{ fontFamily: mono, fontSize: 11, color: item.error ? C.risk : C.accent, flexShrink: 0 }}>
                      {item.error ? "✕" : "✓"}
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 11.5, color: item.error ? C.risk : C.gray300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.file.name}
                    </span>
                    {item.tag && !item.error && (
                      <span style={{ fontFamily: mono, fontSize: 10, color: C.accent, background: C.accentDim, padding: "2px 7px", borderRadius: 4, flexShrink: 0 }}>
                        {item.tag}
                      </span>
                    )}
                  </div>
                  <button className="eiq-btn" onClick={() => removeFile(item.id)} style={{
                    background: "transparent", border: "none", color: C.gray500, cursor: "pointer",
                    fontSize: 14, padding: "0 4px", flexShrink: 0, transition: "color 0.15s ease",
                  }}
                    onMouseEnter={e => e.currentTarget.style.color = C.risk}
                    onMouseLeave={e => e.currentTarget.style.color = C.gray500}
                  >×</button>
                </div>
                {item.error && (
                  <div style={{ fontFamily: font, fontSize: 11.5, color: C.risk, marginTop: 4, paddingLeft: 19 }}>{item.error}</div>
                )}
                {!item.error && (
                  <DocTagSelector value={item.tag} onChange={(tag) => updateTag(item.id, tag)} />
                )}
              </div>
            ))}
          </div>
        )}

        {needsMoreFiles && files.length > 0 && (
          <div style={{ marginTop: 8, fontFamily: font, fontSize: 12, color: C.caution }}>
            ⚠ For best results, upload 2–4 proposals for comparison mode.
          </div>
        )}
      </div>

      {/* Submit */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: mobile ? "stretch" : "flex-start", gap: 8 }}>
        <PrimaryBtn onClick={onSubmit} disabled={!canSubmit} style={{ padding: "13px 28px", width: mobile ? "100%" : "auto" }}>
          {!reviewType ? "Select a review type to begin" : !hasValidFiles ? "Upload at least one file" : needsMoreFiles ? "Upload a second file to compare" : "Run Analysis →"}
        </PrimaryBtn>
        {fileError && <div style={{ fontFamily: font, fontSize: 12.5, color: C.risk }}>{fileError}</div>}
        <div style={{ fontFamily: font, fontSize: 11.5, color: C.gray500 }}>Secure. Confidential. No vendor affiliations.</div>
      </div>
    </div>
  );
}

// ─── Processing Overlay ───
const STEP_N = 5, STEP_BASE = 600, STEP_GAP = 700, DONE_DELAY = 600;

function ProcessingOverlay({ active, onComplete, fileCount, reviewType }) {
  const [step, setStep] = useState(0);
  const cbRef = useRef(onComplete);
  useEffect(() => { cbRef.current = onComplete; }, [onComplete]);
  useScrollLock(active);

  useEffect(() => {
    if (!active) { setStep(0); return; }
    const timers = [];
    for (let i = 0; i < STEP_N; i++) timers.push(setTimeout(() => setStep(i + 1), STEP_BASE + i * STEP_GAP));
    timers.push(setTimeout(() => cbRef.current(), STEP_BASE + (STEP_N - 1) * STEP_GAP + DONE_DELAY));
    return () => timers.forEach(clearTimeout);
  }, [active]);

  if (!active) return null;
  const rtLabel = REVIEW_TYPES.find(r => r.value === reviewType)?.label || "Document";
  const labels = [
    `Parsing ${fileCount > 1 ? fileCount + " documents" : "document"} structure`,
    "Loading benchmark data for your market",
    "Normalizing scope categories",
    "Running risk signal engine",
    "Generating structured report",
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: C.blurOverlay, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}
      role="dialog" aria-label="Processing upload" aria-modal="true">
      <div style={{ background: C.inkLight, border: `1px solid ${C.inkMid}`, borderRadius: 16, padding: "40px 44px", maxWidth: 400, width: "90%" }}>
        <div style={{ fontFamily: font, fontSize: 16, fontWeight: 600, color: C.white, marginBottom: 4, letterSpacing: "-0.01em" }}>Running {rtLabel}...</div>
        <div style={{ fontFamily: mono, fontSize: 11, color: C.gray400, marginBottom: 24 }}>{fileCount} file{fileCount !== 1 ? "s" : ""} · typically 30–90 seconds</div>
        {labels.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, opacity: step > i ? 1 : 0.3, transition: "opacity 0.4s ease" }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: step > i ? C.accent : C.inkMid, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.3s ease", fontSize: 11, color: C.ink, fontWeight: 700 }}>{step > i ? "✓" : ""}</div>
            <span style={{ fontFamily: font, fontSize: 13.5, color: step > i ? C.gray50 : C.gray500, transition: "color 0.3s ease" }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Email Gate ───
function EmailGate({ active, onClose, reviewType }) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState(false);
  const valid = EMAIL_RE.test(email.trim());
  const trapRef = useFocusTrap(active && !sent);
  useScrollLock(active);

  useEffect(() => {
    if (!active) return;
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active, onClose]);

  useEffect(() => { if (active) { setEmail(""); setCompany(""); setTouched(false); setSending(false); setSent(false); setSendError(false); } }, [active]);

  const handleSend = useCallback(async () => {
    if (!valid || sending) return;
    setSending(true);
    setSendError(false);
    const rtLabel = REVIEW_TYPES.find(r => r.value === reviewType)?.label || "Document Review";
    try {
      const res = await fetch(`${API_BASE}/api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          customer_email: email.trim(),
          company: company.trim() || "(not provided)",
          review_type: reviewType,
          source: "ElevatorIQ Landing Page v6",
        }),
      });
      if (res.ok) { setSending(false); setSent(true); }
      else { setSending(false); setSendError(true); }
    } catch { setSending(false); setSendError(true); }
  }, [valid, sending, email, company, reviewType]);

  if (!active) return null;
  const rtLabel = REVIEW_TYPES.find(r => r.value === reviewType)?.label || "your review";

  if (sent) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 100, background: C.blurOverlay, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}
        role="dialog" aria-label="Report sent" aria-modal="true">
        <div style={{ background: C.inkLight, border: `1px solid ${C.inkMid}`, borderRadius: 16, padding: "40px 40px 36px", maxWidth: 400, width: "90%", textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: C.accentDim, margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: C.accent }}>✓</div>
          <div style={{ fontFamily: font, fontSize: 18, fontWeight: 600, color: C.white, marginBottom: 8, letterSpacing: "-0.02em" }}>Report sent.</div>
          <div style={{ fontFamily: font, fontSize: 13.5, color: C.gray400, marginBottom: 24, lineHeight: 1.55 }}>Check your inbox for your {rtLabel} PDF.</div>
          <PrimaryBtn onClick={onClose} style={{ width: "100%" }}>Done</PrimaryBtn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: C.blurOverlay, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}
      role="dialog" aria-label="Report delivery" aria-modal="true">
      <div ref={trapRef} style={{ background: C.inkLight, border: `1px solid ${C.inkMid}`, borderRadius: 16, padding: "40px 40px 36px", maxWidth: 400, width: "90%" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontSize: 18, color: C.accent }}>✓</div>
        <div style={{ fontFamily: font, fontSize: 18, fontWeight: 600, color: C.white, marginBottom: 8, letterSpacing: "-0.02em" }}>Your review is ready.</div>
        <div style={{ fontFamily: font, fontSize: 13.5, color: C.gray400, marginBottom: 6, lineHeight: 1.55 }}>Enter your email to receive the full {rtLabel} as a PDF with executive summary.</div>
        <div style={{ fontFamily: font, fontSize: 12.5, color: C.gray500, marginBottom: 24, lineHeight: 1.5 }}>We email it so you can forward it internally.</div>

        <div style={{ marginBottom: 4 }}>
          <input className="eiq-input" type="email" value={email} onChange={e => { setEmail(e.target.value); setTouched(true); }} onBlur={() => setTouched(true)}
            placeholder="Work email" aria-label="Work email address" disabled={sending}
            style={{ width: "100%", boxSizing: "border-box", background: C.inkMid, border: `1px solid ${C.inkSoft}`, borderRadius: 8, padding: "12px 14px", fontFamily: font, fontSize: 14, color: C.white, outline: "none", opacity: sending ? 0.6 : 1 }} />
        </div>
        <div style={{ minHeight: 22, marginBottom: 10 }}>
          {touched && !valid && email.trim().length > 0 && (
            <div style={{ fontFamily: font, fontSize: 11.5, color: C.gray500, paddingLeft: 2, paddingTop: 4, lineHeight: 1.3 }}>Enter a valid work email to receive the PDF.</div>
          )}
        </div>
        <div style={{ marginBottom: 24 }}>
          <input className="eiq-input" type="text" value={company} onChange={e => setCompany(e.target.value)}
            placeholder="Company name (optional)" aria-label="Company name (optional)" disabled={sending}
            style={{ width: "100%", boxSizing: "border-box", background: C.inkMid, border: `1px solid ${C.inkSoft}`, borderRadius: 8, padding: "12px 14px", fontFamily: font, fontSize: 14, color: C.white, outline: "none", opacity: sending ? 0.6 : 1 }} />
        </div>

        <button className="eiq-btn" onClick={handleSend} disabled={!valid || sending} style={{
          width: "100%", background: !valid && !sending ? C.inkMid : sending ? C.inkSoft : C.accent,
          color: !valid && !sending ? C.gray400 : sending ? C.gray300 : C.ink,
          border: "none", borderRadius: 8, padding: "13px 0", fontFamily: font, fontSize: 14, fontWeight: 600,
          cursor: !valid || sending ? "not-allowed" : "pointer", letterSpacing: "-0.01em", marginBottom: 12,
          transition: "background 0.2s ease, color 0.2s ease",
        }}>{sending ? "Sending..." : "Send My Report"}</button>
        {sendError && <div style={{ fontFamily: font, fontSize: 11.5, color: C.risk, textAlign: "center", marginBottom: 8, lineHeight: 1.3 }}>Something went wrong. Please try again.</div>}
        <div style={{ fontFamily: font, fontSize: 11.5, color: C.gray500, textAlign: "center", lineHeight: 1.4 }}>No account required. No credit card. Your data is never shared.</div>
      </div>
    </div>
  );
}

// ─── Report Tabs (ARIA) — updated with Module C tab ───
function ReportTabs() {
  const [active, setActive] = useState("scope");
  const tabs = [
    { id: "scope", label: "Scope Normalization", sub: "Bid review summary" },
    { id: "findings", label: "Findings Report", sub: "Billing analysis detail" },
    { id: "comparison", label: "Bid Comparison", sub: "Maintenance contracts" },
  ];
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div role="tablist" aria-label="Report type" style={{ display: "flex", gap: 4, background: C.ink, border: `1px solid ${C.inkMid}`, borderRadius: 10, padding: 4, marginBottom: 28, flexWrap: "wrap", justifyContent: "center" }}>
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={active === t.id} aria-controls={`panel-${t.id}`} id={`tab-${t.id}`} className="eiq-btn"
            onClick={() => setActive(t.id)}
            style={{ background: active === t.id ? C.inkMid : "transparent", border: "none", borderRadius: 7, padding: "10px 20px", cursor: "pointer", transition: "background 0.2s ease", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: active === t.id ? C.white : C.gray500, transition: "color 0.2s ease", letterSpacing: "-0.01em" }}>{t.label}</span>
            <span style={{ fontFamily: mono, fontSize: 10, color: active === t.id ? C.gray400 : C.gray600, transition: "color 0.2s ease" }}>{t.sub}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} style={{ width: "100%", display: "flex", justifyContent: "center", minHeight: 400 }}>
        {active === "scope" && <ReportPreview />}
        {active === "findings" && <NarrativeReportPreview />}
        {active === "comparison" && <MaintenanceComparisonPreview />}
      </div>
    </div>
  );
}

// ─── Module C Preview: Maintenance Bid Comparison ───
function MaintenanceComparisonPreview() {
  const anim = useFadeIn(300);
  const { mobile } = useBreakpoint();
  const rows = [
    { category: "Coverage Type", a: "Full Maintenance", b: "Oil & Grease", c: "Parts & Labor", aStatus: "clear", bStatus: "caution", cStatus: "caution" },
    { category: "PM Frequency", a: "12x / year", b: "4x / year", c: "6x / year", aStatus: "clear", bStatus: "risk", cStatus: "caution" },
    { category: "Callback Inclusion", a: "Included", b: "Excluded", c: "Implied", aStatus: "clear", bStatus: "risk", cStatus: "caution" },
    { category: "Major Component Definition", a: "Not Addressed", b: "Not Addressed", c: "Ambiguous", aStatus: "risk", bStatus: "risk", cStatus: "caution" },
    { category: "After-Hours Policy", a: "Included", b: "Billed Separately", c: "Not Addressed", aStatus: "clear", bStatus: "caution", cStatus: "risk" },
    { category: "Escalation Clause", a: "CPI cap 4%", b: "Fixed 3%", c: "Not Addressed", aStatus: "clear", bStatus: "clear", cStatus: "risk" },
    { category: "Auto-Renew", a: "60-day opt-out", b: "30-day opt-out", c: "Automatic", aStatus: "caution", bStatus: "clear", cStatus: "risk" },
  ];
  const statusLabel = { clear: "✓ Explicit", caution: "⚠ Ambiguous", risk: "✕ Gap" };
  const statusColor = { clear: C.clear, caution: C.caution, risk: C.risk };

  return (
    <div style={{ ...anim, background: C.inkLight, border: `1px solid ${C.inkMid}`, borderRadius: 14, overflow: "hidden", maxWidth: 680, width: "100%" }}>
      <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.inkMid}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>ElevatorIQ Bid Comparison — Module C</div>
            <div style={{ fontFamily: font, fontSize: 14.5, fontWeight: 600, color: C.white, letterSpacing: "-0.01em" }}>Maintenance Bid Comparison — 3 Proposals</div>
          </div>
          <StatusTag label="Module C" color={C.accent} />
        </div>
        <div style={{ display: "flex", gap: 20, fontFamily: mono, fontSize: 10.5, color: C.gray400, flexWrap: "wrap" }}>
          <span>3 bids normalized</span><span>11 categories reviewed</span><span style={{ color: C.risk }}>5 structural gaps detected</span>
        </div>
      </div>

      {/* Table header */}
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr 1fr 1fr" : "2fr 1fr 1fr 1fr", borderBottom: `1px solid ${C.inkMid}`, padding: "8px 16px", gap: 8 }}>
        {["Category", "Bid A", "Bid B", "Bid C"].map((h, i) => (
          <div key={i} style={{ fontFamily: mono, fontSize: 10, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</div>
        ))}
      </div>

      {rows.map((r, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: mobile ? "1fr 1fr 1fr 1fr" : "2fr 1fr 1fr 1fr",
          padding: "10px 16px", gap: 8, alignItems: "center",
          borderBottom: i < rows.length - 1 ? `1px solid ${C.inkMid}` : "none",
          background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
        }}>
          <div style={{ fontFamily: font, fontSize: 12.5, color: C.gray100 }}>{r.category}</div>
          {[{ val: r.a, s: r.aStatus }, { val: r.b, s: r.bStatus }, { val: r.c, s: r.cStatus }].map((cell, j) => (
            <div key={j}>
              <div style={{ fontFamily: font, fontSize: 11.5, color: statusColor[cell.s], marginBottom: 2 }}>{cell.val}</div>
              <div style={{ fontFamily: mono, fontSize: 9.5, color: statusColor[cell.s], opacity: 0.7 }}>{statusLabel[cell.s]}</div>
            </div>
          ))}
        </div>
      ))}

      <div style={{ padding: "12px 22px", borderTop: `1px solid ${C.inkMid}`, background: "rgba(232,93,93,0.04)" }}>
        <div style={{ fontFamily: font, fontSize: 12, color: C.gray400, lineHeight: 1.5 }}>
          <span style={{ color: C.risk, fontWeight: 600 }}>Key finding: </span>
          All three proposals leave "Major Component Definition" unaddressed — creating potential unlimited liability. Recommend requiring explicit definition before execution.
        </div>
      </div>
      <div style={{ padding: "10px 22px", borderTop: `1px solid ${C.inkMid}`, fontFamily: mono, fontSize: 10, color: C.gray500 }}>Generated using ElevatorIQ domain logic v1.2 · Tradeoffs only — no vendor recommendation</div>
    </div>
  );
}

// ─── Loop-safe child components ───
function WorkflowStep({ index, step, desc }) {
  const nums = ["01", "02", "03", "04"];
  return (
    <FadeItem delay={200 + index * 100}>
      <div style={{ fontFamily: mono, fontSize: 12, color: C.accent, marginBottom: 10, fontWeight: 500 }}>{nums[index]}</div>
      <div style={{ fontFamily: font, fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 6, letterSpacing: "-0.01em" }}>{step}</div>
      <div style={{ fontFamily: font, fontSize: 13, color: C.gray400, lineHeight: 1.55 }}>{desc}</div>
    </FadeItem>
  );
}
function PersonaCard({ index, title, desc }) {
  return <FadeCard delay={200 + index * 100} style={{ background: C.inkLight, border: `1px solid ${C.inkMid}`, borderRadius: 12, padding: "28px 24px" }}>
    <div style={{ fontFamily: font, fontSize: 14.5, fontWeight: 600, color: C.white, marginBottom: 10, letterSpacing: "-0.01em" }}>{title}</div>
    <div style={{ fontFamily: font, fontSize: 13, color: C.gray400, lineHeight: 1.6 }}>{desc}</div>
  </FadeCard>;
}
function ValuePoint({ index, icon, text }) {
  return <FadeItem delay={150 + index * 80} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "20px 22px", background: C.inkLight, border: `1px solid ${C.inkMid}`, borderRadius: 10 }}>
    <div style={{ width: 36, height: 36, borderRadius: 9, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: C.accent, flexShrink: 0 }}>{icon}</div>
    <div style={{ fontFamily: font, fontSize: 14, fontWeight: 500, color: C.gray100, lineHeight: 1.5, paddingTop: 7 }}>{text}</div>
  </FadeItem>;
}
function RiskItem({ index, text }) {
  return <FadeItem delay={150 + index * 80} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 20px" }}>
    <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.risk, marginTop: 7, flexShrink: 0, opacity: 0.7 }} />
    <span style={{ fontFamily: font, fontSize: 13.5, color: C.gray300, lineHeight: 1.55 }}>{text}</span>
  </FadeItem>;
}
function PricingCard({ index, tier, label, sublabel, features, highlighted }) {
  return <FadeCard delay={200 + index * 100} style={{ background: highlighted ? C.inkMid : C.inkLight, border: `1px solid ${highlighted ? C.accent + "30" : C.inkMid}`, borderRadius: 12, padding: "28px 24px", position: "relative" }}>
    {highlighted && <div style={{ position: "absolute", top: -1, left: 0, right: 0, height: 2, background: C.accent, borderRadius: "12px 12px 0 0" }} />}
    <div style={{ fontFamily: font, fontSize: 14.5, fontWeight: 600, color: C.white, marginBottom: 4, letterSpacing: "-0.01em" }}>{tier}</div>
    <div style={{ fontFamily: font, fontSize: 12.5, color: C.accent, fontWeight: 500, marginBottom: sublabel ? 4 : 20 }}>{label}</div>
    {sublabel && <div style={{ fontFamily: font, fontSize: 11.5, color: C.gray500, marginBottom: 20, lineHeight: 1.4 }}>{sublabel}</div>}
    {features.map((f, j) => <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><span style={{ fontSize: 11, color: C.accent }}>✓</span><span style={{ fontFamily: font, fontSize: 13, color: C.gray300 }}>{f}</span></div>)}
  </FadeCard>;
}
function CompoundItem({ index, number, label, desc, barWidth }) {
  return <FadeItem delay={200 + index * 120} style={{ background: C.inkLight, border: `1px solid ${C.inkMid}`, borderRadius: 10, padding: "18px 20px" }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
      <span style={{ fontFamily: mono, fontSize: 18, fontWeight: 500, color: C.accent, letterSpacing: "-0.02em" }}>{number}</span>
      <span style={{ fontFamily: font, fontSize: 12, color: C.gray400 }}>{label}</span>
    </div>
    <div style={{ fontFamily: font, fontSize: 12.5, color: C.gray300, lineHeight: 1.55, marginBottom: 12 }}>{desc}</div>
    <div style={{ height: 3, borderRadius: 2, background: C.inkMid, overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 2, background: `linear-gradient(90deg, ${C.accent}90, ${C.accent})`, width: barWidth, transition: "width 1s cubic-bezier(0.22, 1, 0.36, 1)" }} />
    </div>
  </FadeItem>;
}

// ─── Report Preview (Module A scope) — unchanged from v5 ───
function ReportPreview() {
  const anim = useFadeIn(300);
  const flags = [
    { label: "Temporary elevator during construction", status: "Not Addressed", color: C.risk },
    { label: "Warranty — parts and labor, 2-year term", status: "Ambiguous", color: C.caution },
    { label: "Owner responsible for power feed to MR", status: "Explicit", color: C.clear },
    { label: "Proprietary diagnostic tools required", status: "Risk Signal", color: C.risk },
    { label: "Hazmat abatement and disposal scope", status: "Not Addressed", color: C.risk },
    { label: "Acceptance testing protocol and witness", status: "Ambiguous", color: C.caution },
    { label: "Pit equipment and buffer replacement", status: "Explicit", color: C.clear },
  ];
  return (
    <div style={{ ...anim, background: C.inkLight, border: `1px solid ${C.inkMid}`, borderRadius: 14, overflow: "hidden", maxWidth: 520, width: "100%" }}>
      <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.inkMid}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>ElevatorIQ Structured Review</div>
            <div style={{ fontFamily: font, fontSize: 14.5, fontWeight: 600, color: C.white, letterSpacing: "-0.01em" }}>Scope Normalization — 3 Bids</div>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.risk }} />
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.caution }} />
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.clear }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, fontFamily: mono, fontSize: 10.5, color: C.gray400, flexWrap: "wrap" }}>
          <span>47 line items processed</span><span>3 bids normalized</span><span style={{ color: C.risk }}>6 risk signals detected</span>
        </div>
      </div>
      <div style={{ padding: "2px 0" }}>
        {flags.map((f, i) => (
          <div key={i} style={{ padding: "12px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: i < flags.length - 1 ? `1px solid ${C.inkMid}` : "none", gap: 12 }}>
            <span style={{ fontFamily: font, fontSize: 12.5, color: C.gray100 }}>{f.label}</span>
            <StatusTag label={f.status} color={f.color} />
          </div>
        ))}
      </div>
      <div style={{ padding: "12px 22px", borderTop: `1px solid ${C.inkMid}`, fontFamily: mono, fontSize: 10, color: C.gray500 }}>Generated using ElevatorIQ domain logic v1.2</div>
    </div>
  );
}

// ─── Narrative Report Preview — unchanged from v5 ───
function NarrativeReportPreview() {
  const anim = useFadeIn(400);
  const { mobile } = useBreakpoint();
  const findings = [
    { title: "Door Operator Repair — Car A", amount: "$4,800", body: "Labor and parts on a worn/defective component fall within the stated full-service scope. The callback log documents this unit\u2019s door operator as a recurring failure point across five entries over five months. No exclusion cited by the vendor.", confidence: "MEDIUM-HIGH", confidenceColor: C.caution, tag: "Scope Conflict", tagColor: C.risk },
    { title: "Emergency Callback — Car A (After Hours)", amount: "$1,950", body: "The contract explicitly includes emergency call response and overtime labor. An after-hours emergency callback sits squarely within both provisions. This charge contradicts two explicit inclusions in the contract excerpt.", confidence: "HIGH", confidenceColor: C.risk, tag: "Scope Conflict", tagColor: C.risk },
    { title: "Controller Reset — Car C", amount: "$2,400", body: "Labor-only corrective maintenance task. The callback log shows the same reset performed the prior month with no root-cause investigation documented. $2,400 for a reset that logged one hour of downtime is notable.", confidence: "MEDIUM-HIGH", confidenceColor: C.caution, tag: "Billing Anomaly", tagColor: C.caution },
  ];
  const establishes = [
    "All five line items describe work that falls within full-service scope based on the contract excerpt provided",
    "No named exclusion has been invoked or is evident",
    "The after-hours callback charge contradicts two explicit provisions in the excerpt",
    "Recurring temporary fixes are generating recurring charges",
  ];
  const nextSteps = [
    { label: "Clarification", text: "Request written justification from the vendor for each line item, specifically identifying which contract provision permits the charge." },
    { label: "Documentation", text: "Obtain the complete maintenance contract \u2014 all sections, amendments, riders, and billing annexes." },
    { label: "Reconciliation", text: "Pull 12\u201324 months of invoices and cross-reference against the callback log and contract terms." },
  ];

  return (
    <div style={{ ...anim, background: C.inkLight, border: `1px solid ${C.inkMid}`, borderRadius: 14, overflow: "hidden", maxWidth: 620, width: "100%" }}>
      <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.inkMid}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>ElevatorIQ Billing Findings Report</div>
            <div style={{ fontFamily: font, fontSize: 14.5, fontWeight: 600, color: C.white, letterSpacing: "-0.01em" }}>Monthly Invoice Review — March 2024</div>
          </div>
          <StatusTag label="Module A" color={C.accent} />
        </div>
        <div style={{ display: "flex", gap: 20, fontFamily: mono, fontSize: 10.5, color: C.gray400, flexWrap: "wrap" }}>
          <span>5 line items reviewed</span><span>$13,550 total invoiced</span><span style={{ color: C.risk }}>3 scope conflicts identified</span>
        </div>
      </div>
      <div style={{ padding: "16px 24px 4px" }}>
        <div style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Line Item Findings</div>
        {findings.map((f, i) => (
          <div key={i} style={{ marginBottom: 16, padding: mobile ? "14px" : "16px 18px", background: C.ink, borderRadius: 10, border: `1px solid ${C.inkMid}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: C.white }}>{f.title}</span>
                <span style={{ fontFamily: mono, fontSize: 11, color: C.gray300 }}>{f.amount}</span>
              </div>
              <StatusTag label={f.tag} color={f.tagColor} />
            </div>
            <div style={{ fontFamily: font, fontSize: 12.5, color: C.gray300, lineHeight: 1.6, marginBottom: 10 }}>{f.body}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.04em" }}>Scope conflict confidence:</span>
              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 500, color: f.confidenceColor }}>{f.confidence}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: "12px 24px 16px", borderTop: `1px solid ${C.inkMid}` }}>
        <div style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>What This Review Establishes</div>
        {establishes.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.accent, marginTop: 6, flexShrink: 0, opacity: 0.7 }} />
            <span style={{ fontFamily: font, fontSize: 12, color: C.gray300, lineHeight: 1.5 }}>{item}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: "12px 24px 20px", borderTop: `1px solid ${C.inkMid}` }}>
        <div style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Recommended Next Steps</div>
        {nextSteps.map((s, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <span style={{ fontFamily: font, fontSize: 12, fontWeight: 600, color: C.white }}>{s.label}: </span>
            <span style={{ fontFamily: font, fontSize: 12, color: C.gray400, lineHeight: 1.5 }}>{s.text}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: "12px 24px", borderTop: `1px solid ${C.inkMid}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.gray500 }}>Generated using ElevatorIQ domain logic v1.2</span>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.gray500 }}>Disposition: Clarification</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
export default function ElevatorIQ() {
  const [processing, setProcessing] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [reviewType, setReviewType] = useState("");
  const [files, setFiles] = useState([]);
  const [fileError, setFileError] = useState(null);
  const { mobile, tablet } = useBreakpoint();

  useEffect(() => {
    const l = document.createElement("link");
    l.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap";
    l.rel = "stylesheet"; document.head.appendChild(l);
    injectFocusStyles();
  }, []);

  const handleDone = useCallback(() => { setProcessing(false); setShowGate(true); }, []);

  const handleSubmit = useCallback(() => {
    const validFiles = files.filter(f => !f.error);
    if (!reviewType || validFiles.length === 0) return;
    setFileError(null);
    setProcessing(true);
  }, [reviewType, files]);

  const triggerUploadScroll = useCallback(() => {
    scrollTo("upload");
  }, []);

  const heroAnim = useFadeIn(0);
  const heroAnim2 = useFadeIn(120);
  const g4 = tablet ? (mobile ? "1fr" : "repeat(2, 1fr)") : "repeat(4, 1fr)";
  const g3 = tablet ? "1fr" : "repeat(3, 1fr)";
  const g2 = mobile ? "1fr" : "1fr 1fr";
  const pGrid = tablet ? "1fr" : "1fr 1fr";

  const steps = [
    { step: "Select your review type", desc: "Invoice review, maintenance bid comparison, modernization analysis, or contract coverage." },
    { step: "Upload your documents", desc: "PDF and Word supported. Upload up to 4 files — invoices, contracts, or competing proposals." },
    { step: "Download structured report", desc: "Clear findings, risk signals, scope gaps, and recommended questions." },
    { step: "Optional expert escalation", desc: "Connect with an independent elevator specialist if needed." },
  ];
  const personas = [
    { title: "Property Managers", desc: "Overseeing multi-building portfolios with ongoing elevator service contracts and capital planning cycles." },
    { title: "Facilities Directors", desc: "Managing aging equipment, evaluating service quality, and ensuring maintenance spend is justified." },
    { title: "Asset Managers", desc: "Evaluating modernization capital spend, comparing vendor proposals, and documenting due diligence." },
  ];
  const vps = [
    { icon: "⊘", text: "Flags scope gaps before contract approval" },
    { icon: "◈", text: "Identifies billing anomalies automatically" },
    { icon: "▤", text: "Creates documentation trail for ownership" },
    { icon: "◉", text: "Surfaces vendor risk signals instantly" },
  ];
  const risks = [
    "Vendor scope language varies significantly across bids",
    "Callback frequency patterns often go unreviewed by ownership",
    "Exclusions and assumptions shift liability back to the building owner",
    "Proprietary tools and software create long-term vendor lock-in",
  ];
  const tiers = [
    { tier: "First Review", label: "Free", features: ["1 upload", "Full structured report", "No credit card required"], highlighted: false },
    { tier: "Pay Per Review", label: "Flat fee per upload", sublabel: "Best for modernization bids", features: ["Unlimited documents per review", "PDF report with executive summary", "Priority processing"], highlighted: false },
    { tier: "Portfolio Plan", label: "Unlimited uploads", features: ["Unlimited reviews", "Priority processing", "Expert escalation access", "Portfolio-level analytics"], highlighted: true },
  ];

  return (
    <div style={{ background: C.ink, minHeight: "100vh", fontFamily: font, color: C.white }}>
      <ProcessingOverlay active={processing} onComplete={handleDone} fileCount={files.filter(f => !f.error).length} reviewType={reviewType} />
      <EmailGate active={showGate} onClose={() => setShowGate(false)} reviewType={reviewType} />

      {/* Nav */}
      <nav style={{ maxWidth: 860, margin: "0 auto", padding: "22px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Logo />
        <div style={{ display: "flex", alignItems: "center", gap: mobile ? 12 : 28 }}>
          <NavLink label="How it works" targetId="workflow" hide={mobile} />
          <NavLink label="Pricing" targetId="pricing" hide={mobile} />
          <PrimaryBtn onClick={triggerUploadScroll} small>Start a Review</PrimaryBtn>
        </div>
      </nav>

      {/* Hero */}
      <Section style={{ padding: "56px 28px 40px", textAlign: "center" }}>
        <div style={heroAnim}>
          <div style={{ display: "inline-flex", alignItems: "center", padding: "5px 14px", borderRadius: 100, background: C.accentSubtle, border: `1px solid ${C.accentDim}`, fontFamily: font, fontSize: 12.5, fontWeight: 500, color: C.accent, marginBottom: 28, letterSpacing: "0.01em" }}>
            Independent Elevator Review Platform
          </div>
          <h1 style={{ fontSize: "clamp(28px, 4.5vw, 44px)", fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.12, margin: "0 0 20px 0", color: C.white }}>
            Upload a bid. Get a structured<br />elevator review in minutes.
          </h1>
        </div>
        <div style={heroAnim2}>
          <p style={{ fontSize: 16, color: C.gray300, lineHeight: 1.6, maxWidth: 540, margin: "0 auto 32px", letterSpacing: "-0.01em" }}>
            ElevatorIQ analyzes maintenance invoices, compares bids, and reviews modernization proposals — delivering a clear, defensible report instantly.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <PrimaryBtn onClick={triggerUploadScroll}>Start your first review (free)</PrimaryBtn>
            <GhostBtn onClick={() => scrollTo("sample")}>View sample report</GhostBtn>
          </div>
          <div style={{ marginTop: 12, fontFamily: font, fontSize: 12, color: C.gray500, letterSpacing: "0.01em" }}>Secure. Confidential. No vendor affiliations.</div>
        </div>
      </Section>

      {/* Upload Panel */}
      <Section border id="upload" style={{ padding: "48px 28px" }}>
        <SectionLabel>Start Here</SectionLabel>
        <SectionTitle>Run your analysis.</SectionTitle>
        <div style={{ height: 24 }} />
        <div style={{ maxWidth: 540 }}>
          <UploadPanel
            reviewType={reviewType}
            onReviewTypeChange={setReviewType}
            files={files}
            onFilesChange={setFiles}
            onSubmit={handleSubmit}
            fileError={fileError}
          />
        </div>
      </Section>

      {/* Workflow */}
      <Section border id="workflow" style={{ padding: "56px 28px" }}>
        <SectionTitle center>Upload. Analyze. Decide.</SectionTitle>
        <div style={{ height: 36 }} />
        <div style={{ display: "grid", gridTemplateColumns: g4, gap: 20 }}>
          {steps.map((s, i) => <WorkflowStep key={i} index={i} step={s.step} desc={s.desc} />)}
        </div>
      </Section>

      {/* Report Previews */}
      <Section border id="sample" style={{ padding: "56px 28px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <SectionLabel>Sample Output</SectionLabel>
        <SectionTitle center>Three modules. One platform.</SectionTitle>
        <div style={{ height: 4 }} />
        <SectionDesc center maxWidth={480}>Invoice reviews, maintenance bid comparisons, and modernization analysis — each producing a structured PDF report with confidence-rated findings.</SectionDesc>
        <div style={{ height: 32 }} />
        <ReportTabs />
      </Section>

      {/* Who It's For */}
      <Section border style={{ padding: "56px 28px" }}>
        <SectionTitle>Built for decision-makers.</SectionTitle>
        <div style={{ height: 24 }} />
        <div style={{ display: "grid", gridTemplateColumns: g3, gap: 20 }}>
          {personas.map((p, i) => <PersonaCard key={i} index={i} title={p.title} desc={p.desc} />)}
        </div>
      </Section>

      {/* Value Points */}
      <Section border style={{ padding: "56px 28px" }}>
        <SectionTitle>Structured intelligence, not guesswork.</SectionTitle>
        <div style={{ height: 24 }} />
        <div style={{ display: "grid", gridTemplateColumns: g2, gap: 16 }}>
          {vps.map((v, i) => <ValuePoint key={i} index={i} icon={v.icon} text={v.text} />)}
        </div>
      </Section>

      {/* Portfolio Intelligence */}
      <Section border style={{ padding: "56px 28px" }}>
        <div style={{ display: "grid", gridTemplateColumns: pGrid, gap: tablet ? 32 : 48, alignItems: "center" }}>
          <div>
            <SectionTitle>Your portfolio intelligence compounds over time.</SectionTitle>
            <div style={{ height: 8 }} />
            <SectionDesc maxWidth={400}>Each review enriches your baseline. The more data ElevatorIQ has across your buildings and contracts, the more precisely it can identify patterns that a single invoice or bid review cannot surface alone.</SectionDesc>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <CompoundItem index={0} number="1st" label="review" desc="Flags scope gaps, billing anomalies, and risk signals against industry thresholds." barWidth="30%" />
            <CompoundItem index={1} number="5th" label="review" desc="Cross-references patterns across your invoices. Recurring vendor behaviors become visible." barWidth="58%" />
            <CompoundItem index={2} number="12th" label="review" desc="Portfolio-level trends emerge. Cost benchmarks calibrate to your specific buildings and contracts." barWidth="88%" />
          </div>
        </div>
        <div style={{ marginTop: 36, padding: "16px 20px", background: C.accentSubtle, border: `1px solid ${C.accentDim}`, borderRadius: 10, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent, flexShrink: 0, opacity: 0.8, marginTop: 4 }} />
          <span style={{ fontFamily: font, fontSize: 13.5, color: C.gray300, lineHeight: 1.5 }}>Your data stays yours. Reviews are confidential and never shared across accounts. Portfolio intelligence is built exclusively from your uploads.</span>
        </div>
      </Section>

      {/* Risk Framing */}
      <Section border style={{ padding: "56px 28px" }}>
        <SectionTitle>Why elevator decisions carry hidden risk.</SectionTitle>
        <div style={{ height: 24 }} />
        <div style={{ display: "grid", gridTemplateColumns: g2, gap: 12 }}>
          {risks.map((r, i) => <RiskItem key={i} index={i} text={r} />)}
        </div>
        <div style={{ marginTop: 28, fontFamily: font, fontSize: 14.5, fontWeight: 500, color: C.white, letterSpacing: "-0.01em" }}>ElevatorIQ normalizes and flags these before you sign.</div>
      </Section>

      {/* Pricing */}
      <Section border id="pricing" style={{ padding: "56px 28px" }}>
        <SectionTitle center>Start free. Scale when you need it.</SectionTitle>
        <div style={{ height: 32 }} />
        <div style={{ display: "grid", gridTemplateColumns: g3, gap: 16 }}>
          {tiers.map((p, i) => <PricingCard key={i} index={i} tier={p.tier} label={p.label} sublabel={p.sublabel} features={p.features} highlighted={p.highlighted} />)}
        </div>
      </Section>

      {/* CTA */}
      <Section border style={{ padding: "64px 28px", textAlign: "center" }}>
        <SectionTitle center>Vendor-neutral analysis.<br />Defensible documentation.</SectionTitle>
        <div style={{ height: 8 }} />
        <SectionDesc center maxWidth={440}>Upload your first elevator bid or maintenance invoice and receive a structured review — free, with no account required.</SectionDesc>
        <div style={{ height: 28 }} />
        <PrimaryBtn onClick={triggerUploadScroll} style={{ padding: "14px 32px", fontSize: 15 }}>Start Your First Review</PrimaryBtn>
        <div style={{ marginTop: 14, fontFamily: font, fontSize: 12, color: C.gray500 }}>Secure. Confidential. No vendor affiliations.</div>
      </Section>

      {/* Footer */}
      <footer style={{ maxWidth: 860, margin: "0 auto", padding: "28px", borderTop: `1px solid ${C.inkMid}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <Logo />
        <div style={{ fontFamily: font, fontSize: 12, color: C.gray500 }}>Independent elevator intelligence. No vendor affiliations.</div>
      </footer>
      <div style={{ height: 20 }} />
    </div>
  );
}
