"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { version } from "../../package.json";
import type { MetalTilt } from "./metal-surface";

const loadMetalSurface = () => import("./metal-surface").then((mod) => mod.MetalSurface);

const MetalSurface = dynamic(loadMetalSurface, { ssr: false });

if (typeof window !== "undefined") {
  void loadMetalSurface();
}

const MAX_TILT_DEG = 0.5;
const TILT_EASE = 0.1;
const FLIP_EASE = 0.12;

const NOOP = () => {};

const engrave =
  "text-[#3e3a34]/60 dark:text-zinc-200/80 [text-shadow:0_1px_0_rgba(255,255,255,0.45),0_-1px_1px_rgba(40,24,16,0.28)] dark:[text-shadow:0_1px_0_rgba(0,0,0,0.55),0_-1px_0_rgba(255,255,255,0.18)]";

interface NetWorthCardProps {
  greeting: string;
  amount?: string | null;
  assets?: string | null;
  liabilities?: string | null;
}

const FlipCorner = ({
  label,
  onFlip,
}: {
  label: string;
  onFlip: () => void;
}) => (
  <button
    type="button"
    aria-label={label}
    onClick={onFlip}
    className="absolute right-0 bottom-0 z-10 h-14 w-14 rounded-br-[22px]"
  >
    <span className="pointer-events-none absolute right-3.5 bottom-3.5 size-3 rounded-br-md border-r border-b border-black/30 dark:border-white/40" />
  </button>
);

export const NetWorthCard = ({
  greeting,
  amount,
  assets,
  liabilities,
}: NetWorthCardProps) => {
  const tilt = useRef<MetalTilt>({ x: 0, y: 0, hover: false, onChange: NOOP });
  const backTilt = useRef<MetalTilt>({ x: 0, y: 0, hover: false, onChange: NOOP });
  const cardRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const showingBackRef = useRef(false);
  const kick = useRef(NOOP);
  const [showingBack, setShowingBack] = useState(false);
  const [backReady, setBackReady] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let running = false;
    let tiltX = 0;
    let tiltY = 0;
    let flip = 0;

    const tick = () => {
      const active = tilt.current.hover && !reducedMotion;
      const targetX = active ? pointer.current.y * MAX_TILT_DEG : 0;
      const targetY = active ? pointer.current.x * MAX_TILT_DEG : 0;
      const targetFlip = showingBackRef.current ? 180 : 0;

      tiltX += (targetX - tiltX) * (reducedMotion ? 1 : TILT_EASE);
      tiltY += (targetY - tiltY) * (reducedMotion ? 1 : TILT_EASE);
      flip += (targetFlip - flip) * (reducedMotion ? 1 : FLIP_EASE);
      if (Math.abs(targetFlip - flip) < 0.05) {
        flip = targetFlip;
      }

      tilt.current.x = tiltX;
      tilt.current.y = tiltY;
      backTilt.current.x = tiltX;
      backTilt.current.y = tiltY;

      if (cardRef.current) {
        cardRef.current.style.transform = `rotateX(${tiltX}deg) rotateY(${flip + tiltY}deg)`;
      }
      tilt.current.onChange();
      backTilt.current.onChange();

      const settled =
        !tilt.current.hover &&
        Math.abs(tiltX) < 0.01 &&
        Math.abs(tiltY) < 0.01 &&
        flip === targetFlip;
      if (settled) {
        running = false;
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) {
        return;
      }
      running = true;
      frame = requestAnimationFrame(tick);
    };

    kick.current = start;

    const node = cardRef.current;
    if (!node) {
      return;
    }

    const onMove = (event: PointerEvent) => {
      const bounds = node.getBoundingClientRect();
      pointer.current = {
        x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        y: -(((event.clientY - bounds.top) / bounds.height) * 2 - 1),
      };
      tilt.current.hover = true;
      backTilt.current.hover = true;
      start();
    };
    const onLeave = () => {
      tilt.current.hover = false;
      backTilt.current.hover = false;
      start();
    };

    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      kick.current = NOOP;
      cancelAnimationFrame(frame);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const flipCard = () => {
    showingBackRef.current = !showingBackRef.current;
    setShowingBack(showingBackRef.current);
    setBackReady(true);
    kick.current();
  };

  return (
    <div className="px-2 pt-1 pb-6" style={{ perspective: "1200px" }}>
      <div ref={cardRef} className="relative" style={{ transformStyle: "preserve-3d" }}>
        <div
          className="relative overflow-hidden rounded-[22px] text-black dark:text-zinc-100"
          style={{ backfaceVisibility: "hidden" }}
          inert={showingBack}
        >
          <div className="card-metal absolute inset-0" />
          <MetalSurface tiltRef={tilt} />

          <div className="relative px-7 py-7 sm:px-9 sm:py-8">
            <h1 className="text-[32px] font-semibold leading-none tracking-[-0.03em]">{greeting}</h1>

            {amount ? (
              <div className="mt-8">
                <p className="text-[15px] text-black/55 dark:text-zinc-400">Net worth</p>
                <p className="mt-2 text-[44px] font-semibold leading-none tracking-[-0.04em] tabular-nums sm:text-[56px]">
                  {amount}
                </p>
                {assets && liabilities ? (
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="rounded-[16px] bg-white/75 px-4 py-3 dark:bg-white/10">
                      <p className="text-[13px] text-black/55 dark:text-zinc-400">Assets</p>
                      <p className="mt-1 text-[22px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                        {assets}
                      </p>
                    </div>
                    <div className="rounded-[16px] bg-white/75 px-4 py-3 dark:bg-white/10">
                      <p className="text-[13px] text-black/55 dark:text-zinc-400">Liabilities</p>
                      <p className="mt-1 text-[22px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                        {liabilities}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <FlipCorner label="Show the back of the card" onFlip={flipCard} />
        </div>

        <div
          className="absolute inset-0 overflow-hidden rounded-[22px]"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          inert={!showingBack}
        >
          <div className="card-metal absolute inset-0" />
          {backReady ? <MetalSurface tiltRef={backTilt} /> : null}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
            <div className="flex flex-col items-center gap-2">
              <div
                role="img"
                aria-label="Netly"
                className="h-[54px] w-[88px] bg-[#3e3a34]/60 dark:bg-zinc-200/80 [filter:drop-shadow(0_1px_0_rgba(255,255,255,0.45))_drop-shadow(0_-1px_1px_rgba(40,24,16,0.28))] dark:[filter:drop-shadow(0_1px_0_rgba(0,0,0,0.55))_drop-shadow(0_-1px_0_rgba(255,255,255,0.18))]"
                style={{
                  WebkitMaskImage: "url(/netly-mark.png)",
                  maskImage: "url(/netly-mark.png)",
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                }}
              />
              <p className={`text-[13px] font-medium tabular-nums ${engrave}`}>v{version}</p>
            </div>
            <p className={`text-[15px] font-medium ${engrave}`}>Made with love by @madeinusmate</p>
          </div>
          <FlipCorner label="Show the front of the card" onFlip={flipCard} />
        </div>
      </div>
    </div>
  );
};
