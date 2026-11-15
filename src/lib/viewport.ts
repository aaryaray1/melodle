import { useEffect, useLayoutEffect, useState } from 'react';

/**
 * How much of the bottom of the layout the on-screen keyboard covers. iOS keeps
 * the layout full height and shrinks only the visible area; Android (with
 * interactive-widget=resizes-content) shrinks the layout itself, so there this is 0.
 */
export function keyboardInset(layoutHeight: number, visibleHeight: number, visibleTop: number): number {
  return Math.max(0, Math.round(layoutHeight - visibleHeight - visibleTop));
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/**
 * Keeps two CSS variables current for the phone dock: --keyboard-inset lifts it
 * above the on-screen keyboard, --visible-height bounds the results list above it.
 */
export function useVisibleViewport(enabled: boolean): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const view = window.visualViewport;
    if (!enabled || !view) {
      root.style.removeProperty('--keyboard-inset');
      root.style.removeProperty('--visible-height');
      return;
    }
    const update = () => {
      root.style.setProperty('--keyboard-inset', `${keyboardInset(window.innerHeight, view.height, view.offsetTop)}px`);
      root.style.setProperty('--visible-height', `${Math.round(view.height)}px`);
    };
    update();
    view.addEventListener('resize', update);
    view.addEventListener('scroll', update);
    return () => {
      view.removeEventListener('resize', update);
      view.removeEventListener('scroll', update);
    };
  }, [enabled]);
}

/** Publishes an element's height as a CSS variable, so the page can leave room for it. */
export function useHeightVariable(element: HTMLElement | null, name: string): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!element) {
      root.style.removeProperty(name);
      return;
    }
    const observer = new ResizeObserver(() => root.style.setProperty(name, `${Math.ceil(element.offsetHeight)}px`));
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty(name);
    };
  }, [element, name]);
}
