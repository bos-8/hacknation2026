let owners = 0;
let previousOverflow = "";

/** Share scroll locking across nested overlays and dialogs, including out-of-order unmounts. */
export function lockBodyScroll() {
  const body = document.body;
  if (owners === 0) previousOverflow = body.style.overflow;
  owners++;
  body.style.overflow = "hidden";
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    owners--;
    if (owners === 0) body.style.overflow = previousOverflow;
  };
}
