"use client";

import { useEffect, useState, type MouseEvent } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { helpSections } from "@/components/help/sections";

const articleTop = (article: HTMLElement, id: string): number => {
  const heading = document.getElementById(id);
  if (!heading) {
    return 0;
  }
  return heading.getBoundingClientRect().top - article.getBoundingClientRect().top + article.scrollTop;
};

export const HelpFrame = ({ children }: { children: React.ReactNode }) => {
  const [activeId, setActiveId] = useState<(typeof helpSections)[number]["id"]>(helpSections[0].id);

  useEffect(() => {
    const article = document.getElementById("help-article");
    if (!article) {
      return;
    }

    const markActive = () => {
      const line = article.getBoundingClientRect().top + 32;
      let current: (typeof helpSections)[number]["id"] = helpSections[0].id;
      for (const section of helpSections) {
        const heading = document.getElementById(section.id);
        if (heading && heading.getBoundingClientRect().top <= line) {
          current = section.id;
        }
      }
      setActiveId(current);

      const link = document.getElementById(`help-nav-${current}`);
      const scroller = link?.closest("[data-sidebar='content']");
      if (!link || !(scroller instanceof HTMLElement)) {
        return;
      }
      const linkRect = link.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      if (linkRect.top < scrollerRect.top || linkRect.bottom > scrollerRect.bottom) {
        scroller.scrollTop += linkRect.top - scrollerRect.top - scroller.clientHeight / 2 + linkRect.height / 2;
      }
    };

    const hash = window.location.hash.slice(1);
    if (helpSections.some((section) => section.id === hash)) {
      article.scrollTop = articleTop(article, hash);
    }
    markActive();
    article.addEventListener("scroll", markActive, { passive: true });
    return () => article.removeEventListener("scroll", markActive);
  }, []);

  const jump = (event: MouseEvent<HTMLAnchorElement>, id: (typeof helpSections)[number]["id"]) => {
    const article = document.getElementById("help-article");
    if (!article) {
      return;
    }
    event.preventDefault();
    article.scrollTo({ top: articleTop(article, id), behavior: "smooth" });
    window.history.replaceState(null, "", `#${id}`);
    setActiveId(id);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar collapsible="none" className="hidden h-full shrink-0 border-r md:flex" style={{ width: "15rem" }}>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>On this page</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {helpSections.map((section) => (
                  <SidebarMenuItem key={section.id}>
                    <SidebarMenuButton asChild isActive={activeId === section.id}>
                      <a id={`help-nav-${section.id}`} href={`#${section.id}`} onClick={(event) => jump(event, section.id)}>
                        <span>{section.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <div id="help-article" className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-8">
        <nav aria-label="On this page" className="mb-8 md:hidden">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">On this page</p>
          <ol className="mt-3 columns-2 gap-x-4">
            {helpSections.map((section) => (
              <li key={section.id} className="break-inside-avoid">
                <a
                  href={`#${section.id}`}
                  onClick={(event) => jump(event, section.id)}
                  className="block rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </div>
    </div>
  );
};
