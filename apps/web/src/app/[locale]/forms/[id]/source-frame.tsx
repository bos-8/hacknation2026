"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Bounds = {left: number; top: number; width: number; height: number};

/** Keep normalized source coordinates attached to the media's actual CSS bounds. */
export function SourceFrame({children, overlay}: {children: ReactNode; overlay: ReactNode}) {
  const frame = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<Bounds>();
  useLayoutEffect(() => {
    const root = frame.current;
    const media = root?.querySelector("img, canvas");
    if (!root || !(media instanceof HTMLElement)) return;
    const measure = () => {
      if (!media.offsetWidth || !media.offsetHeight) {setBounds(undefined); return;}
      const next = {left: media.offsetLeft, top: media.offsetTop,
        width: media.offsetWidth, height: media.offsetHeight};
      setBounds(previous => previous && Object.keys(next).every(
        key => previous[key as keyof Bounds] === next[key as keyof Bounds],
      ) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(media);
    media.addEventListener("load", measure);
    measure();
    return () => {observer.disconnect(); media.removeEventListener("load", measure);};
  }, [children]);
  return <div ref={frame} className="relative w-full">
    {children}
    {bounds && <div className="pointer-events-none absolute" style={bounds}>{overlay}</div>}
  </div>;
}
