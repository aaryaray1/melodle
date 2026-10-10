/**
 * Covers arrive at 500px or more, which is right for the reveal and wasteful for a
 * 48px search thumbnail: forty rows would be over a megabyte on a phone. Deezer
 * and Apple both serve any size if the URL asks for it; other hosts are left as is.
 */
export function thumbnail(url: string | undefined, size: number): string | undefined {
  if (!url) return undefined;
  if (url.includes('dzcdn.net')) return url.replace(/\/\d+x\d+-/, `/${size}x${size}-`);
  if (url.includes('mzstatic.com')) return url.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);
  return url;
}
