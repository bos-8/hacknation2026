"use client";

import Image from "next/image";
import { useState } from "react";

const motionStyles = "object-cover motion-safe:transition-[opacity,transform,rotate,scale] motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover/team:rotate-[4deg] motion-safe:group-hover/team:scale-110 motion-safe:group-focus-within/team:rotate-[4deg] motion-safe:group-focus-within/team:scale-110";
const imageSizes = "(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw";

/** Keep the portrait visible until its optional animated hover layer has loaded. */
export function TeamPortrait({ image, hoverImage, name, eager = false }: {
  image: string; hoverImage?: string; name: string; eager?: boolean;
}) {
  const [loadedHover, setLoadedHover] = useState<string | null>(null);
  const ready = Boolean(hoverImage && loadedHover === hoverImage);
  return (
    <>
      <Image src={image} alt={name} fill loading={eager ? "eager" : "lazy"} sizes={imageSizes}
        data-team-portrait="avatar"
        className={`${motionStyles} object-top ${ready ? "motion-safe:group-hover/team:opacity-0 motion-safe:group-focus-within/team:opacity-0" : ""}`} />
      {hoverImage && <Image src={hoverImage} alt="" aria-hidden="true" fill unoptimized
        loading={eager ? "eager" : "lazy"} sizes={imageSizes} data-team-portrait="hover"
        onLoad={() => setLoadedHover(hoverImage)} onError={() => setLoadedHover(null)}
        className={`${motionStyles} object-center opacity-0 motion-reduce:hidden ${ready ? "motion-safe:group-hover/team:opacity-100 motion-safe:group-focus-within/team:opacity-100" : ""}`} />}
    </>
  );
}
