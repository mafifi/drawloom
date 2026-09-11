import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { createTV } from "tailwind-variants";

// Both merging paths must recognise semantic sizes as typography, not colours.
const themeMergeConfig = { extend: { theme: {
  text: ['body', 'chrome', 'caption', 'small-control'],
  radius: ['bubble'],
} } };
const twMerge = extendTailwindMerge(themeMergeConfig);
export const tv = createTV({ twMergeConfig: themeMergeConfig });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export type WithoutChild<T> = T extends { child?: unknown } ? Omit<T, "child"> : T;
export type WithoutChildren<T> = T extends { children?: unknown } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
