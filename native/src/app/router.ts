/**
 * The app's navigation contract.
 *
 * Every feature folder exports its own `RouteDef[]`; the shell merges them into
 * one map and renders the matching page inside a native `NavStack`, so Android
 * back / iOS swipe-back work without any per-screen code.
 */

import type { JSX } from "nsh";

export type RouteParams = Record<string, string | number | undefined>;

export interface Route {
  name: string;
  params: RouteParams;
}

export interface Nav {
  /** The route this page was rendered for. */
  readonly route: Route;
  push(name: string, params?: RouteParams): void;
  pop(count?: number): void;
  popToRoot(): void;
  replace(name: string, params?: RouteParams): void;
}

export interface RouteDef {
  /** Unique, namespaced: "syllabus", "syllabus.subject", "results.table". */
  name: string;
  /** The native header title for these params. */
  title: (params: RouteParams) => string;
  /** The page body (already inside the header + safe area). */
  render: (nav: Nav) => JSX.Element;
}

/** A route value, for `push`/`replace` callers that prefer objects. */
export function route(name: string, params: RouteParams = {}): Route {
  return { name, params };
}

/** Reads a param as a string ("" when absent). */
export function param(nav: Nav, key: string): string {
  const value = nav.route.params[key];
  return value === undefined || value === null ? "" : String(value);
}

/** Reads a param as a number (0 when absent or not numeric). */
export function numParam(nav: Nav, key: string): number {
  const parsed = Number(nav.route.params[key]);
  return Number.isFinite(parsed) ? parsed : 0;
}
