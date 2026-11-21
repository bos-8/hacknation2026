/** Use the authenticated, revision-specific inline response for both OCR workspaces. */
export function OriginalDocument({ name, src }: { name: string; src: string }) {
  return /\.pdf$/i.test(name)
    ? <iframe title={name} src={src} className="block h-[65vh] w-full" />
    // eslint-disable-next-line @next/next/no-img-element
    : <img alt={name} src={src} className="mx-auto block max-h-[70vh] max-w-full object-contain" />;
}
