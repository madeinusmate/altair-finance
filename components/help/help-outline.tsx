"use client";

import { useEffect, useRef, useState, type FocusEvent, type MouseEvent, type WheelEvent } from "react";
import { cn } from "@/lib/utils";

export type HelpOutlineItem = {
  id: string;
  title: string;
  depth: 0 | 1;
};

const READING_OFFSET = 96;

const scrollParent = (node: HTMLElement): HTMLElement | null => {
  let parent = node.parentElement;
  while (parent) {
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === "auto" || overflow === "scroll") {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
};

const leftTheOutline = (event: MouseEvent<HTMLElement>): boolean => {
  const next = event.relatedTarget;
  const outline = event.currentTarget.closest("[data-help-outline]");
  return !(next instanceof Node) || !outline?.contains(next);
};

export const HelpOutline = ({ items }: { items: readonly HelpOutlineItem[] }) => {
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const [open, setOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const first = document.getElementById(items[0]?.id ?? "");
    const root = first ? scrollParent(first) : null;
    if (!root) {
      return;
    }
    rootRef.current = root;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = root.getBoundingClientRect().top + READING_OFFSET;
      const next: Record<string, number> = {};
      let active = items[0]?.id ?? "";

      for (const item of items) {
        const heading = document.getElementById(item.id);
        if (!heading) {
          continue;
        }
        const top = heading.getBoundingClientRect().top;
        next[item.id] = top;
        if (top <= line) {
          active = item.id;
        }
      }

      setPositions(next);
      setActiveId(active);
      setViewportHeight(window.innerHeight);
    };

    const onScroll = () => {
      if (frame) {
        return;
      }
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [items]);

  const jump = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const heading = document.getElementById(id);
    if (!heading) {
      return;
    }
    event.preventDefault();
    heading.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  };

  const close = (event: MouseEvent<HTMLElement>) => {
    if (leftTheOutline(event)) {
      setOpen(false);
    }
  };

  const blur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
      setOpen(false);
    }
  };

  const scrollWithPage = (event: WheelEvent<HTMLElement>) => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    root.scrollTop += event.deltaY;
  };

  if (viewportHeight === 0) {
    return null;
  }

  return (
    <nav
      aria-label="On this page"
      data-help-outline=""
      className="pointer-events-none fixed top-0 right-4 z-30 hidden h-svh w-72 lg:block"
      onFocus={() => setOpen(true)}
      onBlur={blur}
    >
      {items.map((item) => {
        const top = positions[item.id];
        if (top === undefined || top < 8 || top > viewportHeight - 8) {
          return null;
        }

        const active = item.id === activeId;
        const showLabel = open || active;

        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={active ? "location" : undefined}
            onClick={(event) => jump(event, item.id)}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={close}
            onWheel={scrollWithPage}
            className="pointer-events-auto absolute right-0 flex -translate-y-1/2 items-center"
            style={{ top }}
          >
            <span
              className={cn(
                "mr-3 block max-w-[200px] truncate text-[13px] leading-none transition-[opacity,transform] duration-200 motion-reduce:transition-none",
                item.depth === 1 && "max-w-[184px] text-xs",
                showLabel ? "translate-x-0 opacity-100" : "pointer-events-none w-0 translate-x-1 overflow-hidden opacity-0",
                active ? "font-medium text-foreground" : "text-muted-foreground",
                showLabel && "rounded bg-background/95 px-1.5 py-0.5",
                active && open && "bg-muted",
              )}
            >
              {item.title}
            </span>
            <span
              aria-hidden
              className={cn(
                "block h-px shrink-0 rounded-full",
                item.depth === 1 ? "w-2" : "w-3.5",
                active ? "w-5 bg-foreground" : "bg-foreground/30",
              )}
            />
          </a>
        );
      })}
    </nav>
  );
};
