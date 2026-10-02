// Design tokens lifted from docs/prototype.html.
import type { Color } from '@simpleapp/core';

export interface Palette {
  bg: string;
  raised: string;
  raised2: string;
  border: string;
  text: string;
  dim: string;
  faint: string;
  blue: string;
  orange: string;
  green: string;
  task: string;
  danger: string;
  onAccent: string;
  overlay: string;
}

const accents = {
  blue: '#8fb3d9',
  orange: '#e0b08a',
  green: '#9fcf9f',
  task: '#d9c98f',
  danger: '#e08f8f',
  onAccent: '#0c0c0e',
};

export const palettes: Record<'dark' | 'light', Palette> = {
  dark: {
    bg: '#0c0c0e', raised: '#161619', raised2: '#1e1e22', border: 'rgba(255,255,255,0.09)',
    text: '#f2ede4', dim: '#8c8c93', faint: '#57575d', overlay: 'rgba(0,0,0,0.55)', ...accents,
  },
  light: {
    bg: '#f5f1e9', raised: '#ffffff', raised2: '#ece7dc', border: 'rgba(0,0,0,0.08)',
    text: '#201f1c', dim: '#6b6a65', faint: '#a3a199', overlay: 'rgba(0,0,0,0.35)',
    ...accents, blue: '#4f7fae', orange: '#b9783f', green: '#4f9a5a', danger: '#b94f4f',
  },
};

/** Block colors by kind (blue event / orange reminder), or neutral when color-coding is off. */
export function blockColors(p: Palette, color: Color, colorCode: boolean) {
  if (!colorCode) return { bg: p.raised2, border: p.faint, fg: p.text };
  const c = color === 'blue' ? p.blue : color === 'orange' ? p.orange : p.task;
  return { bg: hexAlpha(c, 0.14), border: c, fg: c };
}

function hexAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const serif = { fontFamily: 'Georgia' } as const;
