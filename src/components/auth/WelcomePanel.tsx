import { motion } from "framer-motion";
import { ShieldCheck, Sparkles, Zap } from "lucide-react";

import { Logo } from "@/components/brand/Logo";

const features = [
  { icon: Zap, label: "Lightning-fast, keyboard-first workflows" },
  { icon: ShieldCheck, label: "SOC 2 Type II & enterprise SSO" },
  { icon: Sparkles, label: "AI that drafts, summarizes, and plans" },
];

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.15 },
  },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
  },
};

export function WelcomePanel() {
  return (
    <div className="relative hidden overflow-hidden bg-[#0B1220] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14">
      {/* Animated aurora blobs */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-24 -top-24 h-[32rem] w-[32rem] animate-aurora-drift rounded-full bg-primary/50 blur-[120px]" />
        <div className="absolute -bottom-32 right-0 h-[28rem] w-[28rem] animate-aurora-drift rounded-full bg-indigo-500/40 blur-[120px] [animation-delay:-6s]" />
        <div className="absolute left-1/3 top-1/2 h-72 w-72 animate-aurora-drift rounded-full bg-sky-400/30 blur-[110px] [animation-delay:-11s]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" aria-hidden="true" />
      {/* Vignette for depth */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_0%,transparent_40%,rgba(11,18,32,0.6)_100%)]"
        aria-hidden="true"
      />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10"
      >
        <motion.div variants={item}>
          <Logo inverted />
        </motion.div>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 max-w-md"
      >
        <motion.h1
          variants={item}
          className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-white xl:text-[2.75rem]"
        >
          Where great teams do their best work.
        </motion.h1>
        <motion.p
          variants={item}
          className="mt-5 text-balance text-lg leading-relaxed text-white/60"
        >
          Plan, build, and ship in one calm, connected workspace. Aurora keeps
          your team aligned — without the noise.
        </motion.p>

        <motion.ul variants={container} className="mt-9 space-y-3.5">
          {features.map(({ icon: Icon, label }) => (
            <motion.li
              key={label}
              variants={item}
              className="flex items-center gap-3 text-[0.95rem] text-white/75"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/15 backdrop-blur">
                <Icon className="h-4 w-4 text-sky-300" />
              </span>
              {label}
            </motion.li>
          ))}
        </motion.ul>
      </motion.div>

      <motion.figure
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 max-w-md"
      >
        <motion.blockquote
          variants={item}
          className="text-balance text-[0.95rem] leading-relaxed text-white/70"
        >
          “Aurora replaced four tools for us. Onboarding a new engineer used to
          take a week — now it takes an afternoon.”
        </motion.blockquote>
        <motion.figcaption
          variants={item}
          className="mt-4 flex items-center gap-3"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-primary text-sm font-semibold text-white">
            MK
          </span>
          <span className="text-sm">
            <span className="block font-medium text-white/90">Maya Kapoor</span>
            <span className="block text-white/50">VP Engineering, Northwind</span>
          </span>
        </motion.figcaption>
      </motion.figure>
    </div>
  );
}
