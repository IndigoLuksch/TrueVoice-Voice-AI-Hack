"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { NumberTicker } from "@/components/ui/number-ticker";
import { TypingAnimation } from "@/components/ui/typing-animation";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { DotPattern } from "@/components/ui/dot-pattern";
import { Marquee } from "@/components/ui/marquee";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Waveform                                                                   */
/* -------------------------------------------------------------------------- */

function Waveform({ bars = 48, className }: { bars?: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("relative flex items-end justify-center gap-[3px] h-24", className)}
    >
      {/* bars */}
      {Array.from({ length: bars }).map((_, i) => {
        const mid = Math.abs(i - bars / 2) / (bars / 2);
        const h = 18 + Math.round((1 - mid) * 58 + Math.sin(i * 0.9) * 10);
        return (
          <span
            key={i}
            className="tv-bar w-[3px] rounded-full bg-orange-500/80"
            style={{
              height: `${h}%`,
              animationDelay: `${(i % 12) * 80}ms`,
              animationDuration: `${900 + (i % 7) * 90}ms`,
            }}
          />
        );
      })}

      {/* sweeping scanner line */}
      <span className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="tv-scan absolute top-0 h-full w-[24%] bg-gradient-to-r from-transparent via-orange-400/30 to-transparent" />
      </span>

      {/* centerline */}
      <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-px bg-neutral-200/80" />
    </div>
  );
}

/* Staggered wordmark: per-letter blur + slide reveal                         */
function Wordmark() {
  const letters = "TRUEVOICE".split("");
  return (
    <h1 className="text-center font-['Space_Grotesk'] font-black tracking-[-0.045em] leading-[0.88] text-[clamp(3.5rem,13vw,11rem)] flex justify-center">
      {letters.map((ch, i) => (
        <motion.span
          key={i}
          initial={{ y: "40%", opacity: 0, filter: "blur(16px)" }}
          animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
          transition={{
            delay: 0.25 + i * 0.06,
            duration: 0.9,
            ease: [0.2, 0.8, 0.2, 1],
          }}
          className={cn(
            "inline-block",
            i < 4 ? "text-neutral-900" : "text-orange-500"
          )}
        >
          {ch}
        </motion.span>
      ))}
    </h1>
  );
}

/* -------------------------------------------------------------------------- */
/* Concordance demo card                                                      */
/* -------------------------------------------------------------------------- */

const DEMO_BIOMARKERS = [
  { name: "low_mood", value: 0.78, delay: "0.6s" },
  { name: "sleep_issues", value: 0.71, delay: "0.9s" },
  { name: "low_energy", value: 0.64, delay: "1.2s" },
  { name: "anhedonia", value: 0.58, delay: "1.5s" },
];

function DemoCard() {
  return (
    <div className="relative rounded-2xl border border-neutral-200 bg-white p-6 md:p-8 shadow-[0_1px_0_rgba(0,0,0,0.04),0_30px_60px_-30px_rgba(0,0,0,0.18)] overflow-hidden">
      <BorderBeam
        size={220}
        duration={9}
        colorFrom="#f97316"
        colorTo="#fb923c"
        borderWidth={1.2}
      />

      {/* header strip */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 tv-pulse-dot" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Live consultation · room{" "}
            <span className="font-mono text-neutral-800">xq4k8m2a</span>
          </span>
        </div>
        <span className="text-[10px] font-mono text-neutral-400">
          00:01:42 elapsed
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* patient utterance */}
        <div className="md:col-span-3 border-l-2 border-neutral-200 pl-4">
          <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-neutral-400 mb-2">
            Patient · transcript
          </div>
          <p className="font-['Space_Grotesk'] text-xl md:text-2xl leading-snug text-neutral-900 min-h-[3.75rem]">
            &ldquo;
            <TypingAnimation
              duration={55}
              delay={400}
              className="italic"
              showCursor={false}
            >
              Honestly, I&rsquo;m fine. Sleeping well, mood is okay.
            </TypingAnimation>
            &rdquo;
          </p>
          <div className="mt-4 text-[10px] font-mono text-neutral-400">
            matched minimization:{" "}
            <span className="px-1 py-0.5 rounded bg-red-50 text-red-600 font-semibold">
              i&rsquo;m fine
            </span>
            <span className="mx-1.5">·</span>
            <span className="px-1 py-0.5 rounded bg-red-50 text-red-600 font-semibold">
              sleeping well
            </span>
          </div>
        </div>

        {/* biomarker lane */}
        <div className="md:col-span-2 rounded-lg bg-neutral-50/60 border border-neutral-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-neutral-500">
              Thymia biomarkers
            </span>
            <span className="text-[9px] font-mono text-neutral-400">60s window</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {DEMO_BIOMARKERS.map((b, i) => (
              <motion.div
                key={b.name}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.18, duration: 0.5, ease: "easeOut" }}
              >
                <div className="flex justify-between text-[10px] font-mono mb-1">
                  <span className="text-neutral-600">{b.name}</span>
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      b.value > 0.7
                        ? "text-red-600"
                        : b.value > 0.5
                          ? "text-amber-600"
                          : "text-emerald-600"
                    )}
                  >
                    <NumberTicker
                      value={b.value}
                      decimalPlaces={2}
                      delay={0.4 + i * 0.2}
                      className={cn(
                        b.value > 0.7
                          ? "text-red-600"
                          : b.value > 0.5
                            ? "text-amber-600"
                            : "text-emerald-600"
                      )}
                    />
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-neutral-200/70 overflow-hidden">
                  <div
                    className={cn(
                      "tv-meter-fill h-full rounded-full",
                      b.value > 0.7
                        ? "bg-red-500"
                        : b.value > 0.5
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    )}
                    style={
                      {
                        "--tv-to": `${Math.round(b.value * 100)}%`,
                        "--tv-delay": b.delay,
                      } as React.CSSProperties
                    }
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* concordance flag */}
      <div
        className="tv-flag-in mt-6 flex items-start gap-4 rounded-lg border-l-2 border-red-500 bg-gradient-to-r from-red-50 via-red-50/60 to-transparent p-4"
        style={{ "--tv-delay": "2.4s" } as React.CSSProperties}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[9px] font-bold tracking-[0.22em] text-red-600 uppercase">
              Concordance gap
            </span>
            <span className="text-[9px] font-mono text-neutral-400">flag · 102.4s</span>
          </div>
          <p className="text-sm text-neutral-800 leading-relaxed">
            Patient self-reports positively but voice biomarkers indicate{" "}
            <span className="font-semibold text-red-700">sustained low mood</span>{" "}
            and{" "}
            <span className="font-semibold text-red-700">elevated sleep disturbance</span>{" "}
            in the preceding minute. Worth exploring.
          </p>
          <p className="mt-1 text-[10px] font-mono text-neutral-400">
            · claude-haiku-4-5 · 842 ms
          </p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Mode card                                                                  */
/* -------------------------------------------------------------------------- */

function ModeCard({
  kicker,
  title,
  description,
  href,
  cta,
  variant = "default",
  icon,
}: {
  kicker: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  variant?: "default" | "primary";
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col justify-between rounded-2xl border p-6 md:p-7 transition-all duration-300",
        "hover:-translate-y-0.5",
        variant === "primary"
          ? "bg-neutral-950 text-white border-neutral-900 hover:shadow-[0_30px_60px_-30px_rgba(249,115,22,0.55)]"
          : "bg-white text-neutral-900 border-neutral-200 hover:border-neutral-900"
      )}
    >
      <div>
        <div
          className={cn(
            "flex items-center justify-between",
            variant === "primary" ? "text-orange-400" : "text-orange-500"
          )}
        >
          <span className="text-[10px] font-bold tracking-[0.22em] uppercase">
            {kicker}
          </span>
          {icon}
        </div>
        <h3
          className={cn(
            "font-['Space_Grotesk'] text-2xl md:text-3xl font-bold tracking-tight mt-5",
            variant === "primary" ? "text-white" : "text-neutral-900"
          )}
        >
          {title}
        </h3>
        <p
          className={cn(
            "mt-3 text-sm leading-relaxed",
            variant === "primary" ? "text-neutral-400" : "text-neutral-500"
          )}
        >
          {description}
        </p>
      </div>

      <div
        className={cn(
          "mt-8 flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] uppercase",
          variant === "primary" ? "text-orange-400" : "text-neutral-900"
        )}
      >
        {cta}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="transition-transform duration-300 group-hover:translate-x-1"
        >
          <path
            d="M3 7h8m0 0L7 3m4 4l-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/* Partner monograms: geometric brand marks, not the actual logos */
function SpeechmaticsMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M5 14c2 0 2-6 4-6s2 12 4 12 2-12 4-12 2 6 4 6" />
      </g>
    </svg>
  );
}
function ThymiaMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <g stroke="currentColor" strokeWidth="1.8" fill="none">
        <circle cx="14" cy="14" r="9" />
        <path d="M9 14h10M14 9v10" strokeLinecap="round" />
      </g>
    </svg>
  );
}
function ClaudeMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <g fill="currentColor">
        <path d="M14 3l1.6 6.3L22 11l-6.4 1.7L14 19l-1.6-6.3L6 11l6.4-1.7z" />
        <circle cx="14" cy="23" r="1.2" />
      </g>
    </svg>
  );
}
function WebRTCMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M3 14a11 11 0 0122 0" />
        <path d="M7 14a7 7 0 0114 0" />
        <circle cx="14" cy="14" r="1.8" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}
function FastAPIMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <path
        d="M14 3l-8 14h6l-2 8 8-14h-6z"
        fill="currentColor"
      />
    </svg>
  );
}
function NextMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <g stroke="currentColor" strokeWidth="1.8" fill="none">
        <circle cx="14" cy="14" r="10" />
        <path d="M10 9v10M18 19L10 9" strokeLinecap="round" />
      </g>
    </svg>
  );
}

const PARTNERS: {
  name: string;
  role: string;
  Mark: () => React.JSX.Element;
}[] = [
  { name: "Speechmatics", role: "Medical STT · real-time", Mark: SpeechmaticsMark },
  {
    name: "Thymia Sentinel",
    role: "Voice biomarkers · Helios / Apollo / Psyche",
    Mark: ThymiaMark,
  },
  { name: "Anthropic Claude", role: "Flag gloss + report synthesis", Mark: ClaudeMark },
  { name: "WebRTC", role: "Cross-device video + audio", Mark: WebRTCMark },
  { name: "FastAPI", role: "Streaming event bus · sub-second", Mark: FastAPIMark },
  { name: "Next.js", role: "Clinician dashboard · App Router", Mark: NextMark },
];

export default function TrueVoiceLanding() {
  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans flex flex-col">
      {/* ------------------------------------------------------------------ */}
      {/* Top bar                                                            */}
      {/* ------------------------------------------------------------------ */}
      <header className="relative z-50 flex items-center justify-between px-6 md:px-10 py-5 border-b border-neutral-100">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-['Space_Grotesk'] text-[17px] font-bold tracking-tight"
        >
          <span className="relative inline-block h-2.5 w-2.5 rounded-full bg-orange-500">
            <span className="absolute inset-0 rounded-full bg-orange-500 tv-pulse-dot" />
          </span>
          <span className="text-orange-500">TRUE</span>
          <span className="text-neutral-900 -ml-2.5">VOICE</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-[11px] font-bold uppercase tracking-[0.22em] text-neutral-500">
          <Link href="/about" className="hover:text-neutral-900 transition-colors">
            About
          </Link>
          <Link href="/online" className="hover:text-neutral-900 transition-colors">
            Telehealth
          </Link>
          <Link href="/in-person" className="hover:text-neutral-900 transition-colors">
            In-person
          </Link>
          <Link href="/test-ui" className="hover:text-neutral-900 transition-colors">
            Compare demo
          </Link>
        </nav>

        <div className="hidden md:flex items-center gap-2 rounded-full border border-neutral-200 bg-white/70 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 tv-pulse-dot" />
          <span className="text-[10px] font-mono text-neutral-500">
            pipeline online
          </span>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative flex-1 overflow-hidden">
        <DotPattern
          className={cn(
            "[mask-image:radial-gradient(ellipse_at_center,white_30%,transparent_75%)]",
            "text-neutral-200/70"
          )}
          width={22}
          height={22}
          cr={0.9}
        />

        <div className="relative max-w-6xl mx-auto px-6 md:px-10 pt-14 md:pt-20 pb-10">
          {/* kicker */}
          <BlurFade delay={0.05} className="flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/70 px-3.5 py-1.5 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500 tv-pulse-dot" />
              <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-neutral-600">
                Clinical voice intelligence · live
              </span>
            </div>
          </BlurFade>

          {/* wordmark */}
          <div className="mt-8">
            <Wordmark />
          </div>

          {/* headline */}
          <BlurFade delay={0.3}>
            <p className="mt-8 text-center font-['Space_Grotesk'] text-2xl md:text-4xl font-medium tracking-tight text-neutral-900">
              Patients minimize.{" "}
              <span className="italic font-bold text-orange-500">
                Voices don&rsquo;t.
              </span>
            </p>
          </BlurFade>

          {/* sub */}
          <BlurFade delay={0.45}>
            <p className="mt-5 mx-auto max-w-2xl text-center text-[15px] md:text-base leading-relaxed text-neutral-500">
              A real-time clinical surface for GPs. We capture raw voice at 16 kHz,
              run medical STT and voice biomarkers in parallel, and flag the gap
              between what the patient says and what their voice reveals,
              with evidence, on a one-page report.
            </p>
          </BlurFade>

          {/* CTAs */}
          <BlurFade delay={0.6}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link href="/online">
                <ShimmerButton
                  background="linear-gradient(135deg,#f97316 0%,#ea580c 100%)"
                  shimmerColor="#fff"
                  shimmerDuration="2.6s"
                  borderRadius="10px"
                  className="px-6 py-3.5 text-[12px] font-bold uppercase tracking-[0.22em] shadow-[0_10px_30px_-10px_rgba(249,115,22,0.7)]"
                >
                  Start telehealth consultation
                </ShimmerButton>
              </Link>
              <Link
                href="/in-person"
                className="inline-flex items-center gap-2 rounded-[10px] border border-neutral-900 bg-white px-6 py-3.5 text-[12px] font-bold uppercase tracking-[0.22em] text-neutral-900 transition-all hover:bg-neutral-900 hover:text-white"
              >
                Start in-person
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path
                    d="M3 6.5h7m0 0L6.5 3m3.5 3.5L6.5 10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <Link
                href="/test-ui"
                className="group inline-flex items-center gap-2 px-3 py-3.5 text-[12px] font-bold uppercase tracking-[0.22em] text-neutral-500 hover:text-orange-500 transition-colors"
              >
                See codec demo
                <span className="text-[10px] font-mono text-neutral-300 group-hover:text-orange-400">
                  /compare
                </span>
              </Link>
            </div>
          </BlurFade>

          {/* waveform */}
          <BlurFade delay={0.8}>
            <div className="relative mt-14 mx-auto max-w-3xl">
              <Waveform bars={56} />
              <div className="mt-3 flex items-center justify-between text-[9px] font-mono uppercase tracking-[0.22em] text-neutral-400">
                <span>16 kHz · mono · pcm16</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-orange-500" /> capture
                  active
                </span>
                <span>40 ms frames</span>
              </div>
            </div>
          </BlurFade>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Live demo card                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative bg-neutral-50/70 border-y border-neutral-100">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-20">
          <BlurFade inView delay={0.05}>
            <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
              <div>
                <div className="text-[10px] font-bold tracking-[0.25em] uppercase text-orange-500 mb-2">
                  · The moment we catch
                </div>
                <h2 className="font-['Space_Grotesk'] text-3xl md:text-5xl font-bold tracking-tight">
                  A live concordance gap,
                  <br />
                  <span className="text-neutral-400">captured in under a second.</span>
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-relaxed text-neutral-500">
                Below is a reconstruction from a real session: a minimization phrase
                meets voice biomarkers already breaching threshold. The GP sees the
                flag before the next sentence.
              </p>
            </div>
          </BlurFade>

          <BlurFade inView delay={0.15}>
            <DemoCard />
          </BlurFade>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Stats                                                              */}
      {/* ------------------------------------------------------------------ */}
      <section className="max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-4">
          {[
            {
              value: 842,
              suffix: " ms",
              label: "Flag latency",
              note: "Haiku 4.5 · hot path",
            },
            {
              value: 16,
              suffix: " kHz",
              label: "Raw audio fidelity",
              note: "vs 8 kHz Opus voip",
            },
            {
              value: 3,
              suffix: "",
              label: "Biomarker models",
              note: "Helios · Apollo · Psyche",
            },
            {
              value: 1,
              suffix: " page",
              label: "GP evidence report",
              note: "Claude Sonnet synthesis",
            },
          ].map((s, i) => (
            <BlurFade inView delay={0.05 * i} key={s.label}>
              <div className="border-t border-neutral-900 pt-4">
                <div className="font-['Space_Grotesk'] text-4xl md:text-5xl font-bold tracking-tight flex items-baseline">
                  <NumberTicker
                    value={s.value}
                    className="text-neutral-900"
                    decimalPlaces={0}
                  />
                  <span className="text-orange-500">{s.suffix}</span>
                </div>
                <div className="mt-2 text-[11px] font-bold tracking-[0.22em] uppercase text-neutral-900">
                  {s.label}
                </div>
                <div className="mt-1 text-[10px] font-mono text-neutral-400">
                  {s.note}
                </div>
              </div>
            </BlurFade>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Three modes                                                        */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-neutral-50/70 border-y border-neutral-100">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-20">
          <BlurFade inView>
            <div className="max-w-2xl">
              <div className="text-[10px] font-bold tracking-[0.25em] uppercase text-orange-500 mb-2">
                · Three consultation surfaces
              </div>
              <h2 className="font-['Space_Grotesk'] text-3xl md:text-5xl font-bold tracking-tight">
                One signal.
                <br />
                <span className="text-neutral-400">
                  Everywhere the consultation happens.
                </span>
              </h2>
            </div>
          </BlurFade>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
            <BlurFade inView delay={0.1}>
              <ModeCard
                kicker="01 · Telehealth"
                title="Browser video call"
                description="Patient + clinician join over WebRTC. Patient audio is diverted through medical STT and Thymia in parallel. Clinician sees biomarker bars and flags live."
                href="/online"
                cta="Start consultation"
                variant="primary"
                icon={
                  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
                    <rect x="2" y="7" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M16 11l7-3.2v10.4L16 15" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    <circle cx="6.5" cy="12" r="1.3" fill="currentColor" />
                    <path d="M9.5 15c0-1.2 1.3-2 2.5-2s2.5.8 2.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                }
              />
            </BlurFade>
            <BlurFade inView delay={0.2}>
              <ModeCard
                kicker="02 · In-person"
                title="Single laptop on the desk"
                description="GP opens one tab, patient speaks into the laptop mic. The dashboard glanceable on a second monitor catches flags while the GP keeps eye contact."
                href="/in-person"
                cta="Start session"
                icon={
                  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
                    <rect x="3.5" y="5" width="19" height="12" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M2 19h22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M10 9.5a3 3 0 106 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                    <circle cx="13" cy="13" r="1.2" fill="currentColor" />
                  </svg>
                }
              />
            </BlurFade>
            <BlurFade inView delay={0.3}>
              <ModeCard
                kicker="03 · Codec demo"
                title="Raw PCM vs Opus VOIP"
                description="Side-by-side Thymia output on identical audio. Raw 16 kHz versus 24 kbps Opus. A visceral demo of why telehealth biomarkers need our pipeline."
                href="/test-ui"
                cta="Open comparison"
                icon={
                  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
                    <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                      <path d="M3 13c2 0 2-5 4-5s2 10 4 10" />
                      <path d="M13 13c2 0 2-3 4-3s2 6 4 6" opacity="0.45" />
                    </g>
                  </svg>
                }
              />
            </BlurFade>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Pipeline partners                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-20">
        <BlurFade inView>
          <div className="flex items-baseline justify-between flex-wrap gap-4">
            <h2 className="font-['Space_Grotesk'] text-2xl md:text-3xl font-bold tracking-tight">
              The pipeline
            </h2>
            <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-[0.22em]">
              mic → 16 kHz pcm → [ stt | biomarkers ] → concordance → claude → ui
            </div>
          </div>
        </BlurFade>

        <BlurFade inView delay={0.1}>
          <div className="relative mt-8 rounded-2xl border border-neutral-200 bg-white overflow-hidden">
            <Marquee
              pauseOnHover
              className="[--duration:40s] [--gap:2.5rem] py-6 [mask-image:linear-gradient(to_right,transparent,white_10%,white_90%,transparent)]"
            >
              {PARTNERS.map((p) => (
                <div
                  key={p.name}
                  className="group flex items-center gap-4 px-5 whitespace-nowrap"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-900 transition-colors group-hover:text-orange-500 group-hover:border-orange-200 group-hover:bg-orange-50">
                    <p.Mark />
                  </span>
                  <div className="flex flex-col">
                    <span className="font-['Space_Grotesk'] text-lg font-bold tracking-tight text-neutral-900 leading-tight">
                      {p.name}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400 tracking-wide">
                      {p.role}
                    </span>
                  </div>
                </div>
              ))}
            </Marquee>
          </div>
        </BlurFade>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Closing CTA                                                        */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative bg-neutral-950 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-[0.08]">
          <DotPattern className="text-white" />
        </div>

        {/* animated orange glow */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-orange-500/25 blur-[120px]"
          animate={{ opacity: [0.5, 0.9, 0.5], scale: [1, 1.15, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative max-w-4xl mx-auto px-6 md:px-10 py-20 md:py-28 text-center">
          <BlurFade inView>
            <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-orange-400">
              · ready in one click
            </p>
          </BlurFade>
          <BlurFade inView delay={0.1}>
            <h2 className="mt-5 font-['Space_Grotesk'] text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              Create a room.
              <br />
              <span className="text-orange-500">Hear what&rsquo;s underneath.</span>
            </h2>
          </BlurFade>
          <BlurFade inView delay={0.2}>
            <p className="mt-6 mx-auto max-w-lg text-neutral-400 text-[15px] leading-relaxed">
              Rooms are ephemeral, in-memory, and destroyed when the tab closes.
              No recordings stored. No accounts. Just signal.
            </p>
          </BlurFade>
          <BlurFade inView delay={0.3}>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link href="/online">
                <ShimmerButton
                  background="#f97316"
                  shimmerColor="#fff"
                  shimmerDuration="2.6s"
                  borderRadius="10px"
                  className="px-7 py-4 text-[12px] font-bold uppercase tracking-[0.22em]"
                >
                  Start telehealth
                </ShimmerButton>
              </Link>
              <Link
                href="/in-person"
                className="inline-flex items-center gap-2 rounded-[10px] border border-white/20 bg-white/5 px-7 py-4 text-[12px] font-bold uppercase tracking-[0.22em] text-white transition-all hover:bg-white hover:text-neutral-950"
              >
                Start in-person
              </Link>
            </div>
          </BlurFade>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Footer                                                             */}
      {/* ------------------------------------------------------------------ */}
      <footer className="border-t border-neutral-100 px-6 md:px-10 py-8">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-['Space_Grotesk'] text-sm font-bold tracking-tight">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            <span className="text-orange-500">TRUE</span>
            <span className="text-neutral-900 -ml-1.5">VOICE</span>
          </div>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-400">
            Built for the Voice AI hack · London · {new Date().getFullYear()}
          </p>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-400">
            Not a diagnostic device · research-grade signal
          </p>
        </div>
      </footer>
    </div>
  );
}
