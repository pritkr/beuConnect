/**
 * A small month grid for the holidays screen. Local dates only: the grid is
 * built from calendar days, never from UTC timestamps, so it stays correct in
 * IST whatever the device's offset is.
 */

import { isoDate } from "./engine";

export interface GridDay {
  /** `YYYY-MM-DD`. */
  iso: string;
  day: number;
  /** Weekday index, 0 = Sunday (used for the tint of Sundays). */
  weekday: number;
}

export type GridCell = GridDay | null;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month] ?? ""} ${year}`;
}

/**
 * Seven columns, Sunday first. Leading `null`s line the first day up with its
 * weekday; no trailing padding, so the grid ends where the month does.
 */
export function monthCells(year: number, month: number): GridCell[] {
  const first = new Date(year, month, 1, 12);
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const cells: GridCell[] = [];

  for (let blank = 0; blank < first.getDay(); blank += 1) cells.push(null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day, 12);
    cells.push({ iso: isoDate(date), day, weekday: date.getDay() });
  }

  return cells;
}

/** The month index to open on: today's when it is in range, else the first. */
export function openingMonth(year: number, today: Date = new Date()): number {
  return today.getFullYear() === year ? today.getMonth() : 0;
}
