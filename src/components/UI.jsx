import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Info,
  LoaderCircle,
  X,
  AlertTriangle,
} from "lucide-react";
import { dateTime } from "../lib/habit.js";

export function MotionButton({ children, className = "", disabled, ...props }) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      whileHover={disabled || reduced ? undefined : { scale: 1.018, y: -1 }}
      whileTap={disabled || reduced ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 420, damping: 25 }}
      disabled={disabled}
      className={`action-button ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export function Panel({ children, className = "", delay = 0, ...props }) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      initial={reduced ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`glass-panel ${className}`}
      {...props}
    >
      {children}
    </motion.section>
  );
}

export function Spinner({ className = "" }) {
  return (
    <LoaderCircle
      aria-hidden="true"
      className={`animate-spin motion-reduce:animate-none ${className}`}
    />
  );
}

export function Dialog({ open, onClose, title, children, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={`modal-shell ${className}`}
      aria-label={title}
    >
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="relative p-6 sm:p-8"
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            <MotionButton
              aria-label="Close dialog"
              onClick={onClose}
              className="icon-button shrink-0"
            >
              <X size={20} />
            </MotionButton>
          </div>
          {children}
        </motion.div>
      )}
    </dialog>
  );
}

export function ProgressRing({ completed, total, state }) {
  const reduced = useReducedMotion();
  const radius = 82;
  const circumference = Math.PI * 2 * radius;
  const progress = total ? Math.min(completed / total, 1) : 0;
  const failed = state === "failed";
  return (
    <div className={`progress-orb ${failed ? "progress-orb-failed" : ""}`}>
      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-label={`${completed} of ${total} check-ins complete`}
        className="h-full w-full -rotate-90 overflow-visible"
      >
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="10"
        />
        <circle
          cx="100"
          cy="100"
          r="65"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
          strokeDasharray="2 7"
        />
        <motion.circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke={failed ? "#fb923c" : "#00ff00"}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: circumference * (1 - progress) }}
          transition={{ duration: reduced ? 0 : 1.1, ease: "easeOut" }}
          className="ring-glow"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mb-1 text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
          {state === "empty" ? "Your next streak" : "Check-ins"}
        </span>
        <span className="font-mono text-5xl font-semibold tracking-tighter text-white">
          {completed}
          <span className="text-2xl font-normal text-zinc-500">/{total}</span>
        </span>
        <span className="mt-2 text-sm text-zinc-400">
          {state === "empty"
            ? "Not started"
            : `${Math.round(progress * 100)}% complete`}
        </span>
      </div>
    </div>
  );
}

export function StreakGrid({ habit, days, state, selectedDay, onSelect }) {
  const count = habit?.totalDays || days;
  const completed = habit?.completedDays || 0;
  return (
    <div>
      <div
        className="streak-grid"
        role="group"
        aria-label={
          habit?.stake
            ? "Daily check-in history"
            : "Preview of daily check-in windows"
        }
      >
        {Array.from({ length: count }, (_, index) => {
          const done = index < completed;
          const missed = state === "failed" && index === completed;
          const current = state === "ready" && index === completed;
          const name = done
            ? "complete"
            : missed
              ? "missed"
              : current
                ? "open now"
                : "upcoming";
          return (
            <MotionButton
              key={index}
              aria-label={`Day ${index + 1}: ${name}`}
              aria-pressed={selectedDay === index}
              onClick={() => onSelect(index)}
              className={`streak-cell ${done ? "streak-done" : ""} ${missed ? "streak-missed" : ""} ${current ? "streak-current" : ""} ${selectedDay === index ? "streak-selected" : ""}`}
            >
              {done ? (
                <Check size={18} strokeWidth={2.7} />
              ) : missed ? (
                <X size={18} />
              ) : (
                <span>{String(index + 1).padStart(2, "0")}</span>
              )}
            </MotionButton>
          );
        })}
      </div>
      <p
        className="mt-3 min-h-10 text-xs leading-relaxed text-zinc-400"
        aria-live="polite"
      >
        {habit?.stake ? (
          <>
            Day {selectedDay + 1}:{" "}
            {dateTime(habit.startedAt + selectedDay * 86400)} –{" "}
            {dateTime(habit.startedAt + (selectedDay + 1) * 86400)}. End time is
            exclusive.
          </>
        ) : (
          "A preview of your commitment. Every square becomes one 24-hour check-in window."
        )}
      </p>
    </div>
  );
}

export function Celebration({ trigger }) {
  const reduced = useReducedMotion();
  if (!trigger) return null;
  return (
    <div
      key={trigger}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[28px]"
    >
      <motion.div
        initial={{ opacity: 0.65, scale: 0.8 }}
        animate={{ opacity: 0, scale: reduced ? 1 : 1.4 }}
        transition={{ duration: 1.1 }}
        className="absolute inset-8 rounded-full border border-[#00ff00] bg-[#00ff00]/10 blur-xl"
      />
      {!reduced &&
        Array.from({ length: 16 }, (_, index) => (
          <motion.span
            key={index}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos((index * Math.PI) / 8) * (150 + (index % 3) * 35),
              y: Math.sin((index * Math.PI) / 8) * 120 - 50,
              opacity: 0,
              scale: 0,
              rotate: index * 70,
            }}
            transition={{ duration: 1 + (index % 4) * 0.12, ease: "easeOut" }}
            className="absolute left-1/2 top-1/2 h-2 w-2 rounded-sm bg-[#00ff00] shadow-[0_0_14px_#00ff00]"
          />
        ))}
    </div>
  );
}

export function Toast({ notice, onDismiss }) {
  const Icon =
    notice?.type === "success"
      ? CheckCircle2
      : notice?.type === "error"
        ? AlertTriangle
        : Info;
  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          key={notice.id}
          initial={{ opacity: 0, y: 25, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 15 }}
          className={`toast ${notice.type === "error" ? "toast-error" : ""}`}
          role={notice.type === "error" ? "alert" : "status"}
        >
          <Icon
            size={21}
            className={
              notice.type === "error"
                ? "mt-0.5 shrink-0 text-amber-400"
                : "mt-0.5 shrink-0 text-[#00ff00]"
            }
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-relaxed">{notice.message}</p>
            {notice.link && (
              <a
                className="mt-2 inline-flex items-center gap-1 text-sm text-[#00ff00] underline underline-offset-4"
                href={notice.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                View transaction <ExternalLink size={13} />
              </a>
            )}
          </div>
          <MotionButton
            aria-label="Dismiss notification"
            className="rounded-lg p-1 text-zinc-400 hover:text-white"
            onClick={onDismiss}
          >
            <X size={18} />
          </MotionButton>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
