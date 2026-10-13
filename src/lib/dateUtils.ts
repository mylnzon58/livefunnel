/**
 * Argentina Timezone Utilities
 * Current Offset: UTC-3 (America/Argentina/Buenos_Aires)
 */

export const ARG_TIMEZONE = "America/Argentina/Buenos_Aires";

/**
 * Returns a Date object adjusted to Argentina Time
 * (Useful for getting current day/hour/etc in AR context)
 */
export function getArgDate(date: Date | string | number = new Date()): Date {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Date(d.toLocaleString("en-US", { timeZone: ARG_TIMEZONE }));
}

/**
 * Formats a date string/Date into Argentina local format (DD/MM/YYYY)
 */
export function formatArgDate(date: Date | string | number): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return d.toLocaleDateString("es-AR", {
    timeZone: ARG_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Formats a date string/Date into Argentina local time (HH:MM:SS)
 */
export function formatArgTime(date: Date | string | number): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return d.toLocaleTimeString("es-AR", {
    timeZone: ARG_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

/**
 * Returns the current ISO string but adjusted to Argentina's wall clock.
 * Use this sparingly; mostly for displaying "Current AR Time" in a consistent format.
 */
export function getArgISOString(date: Date = new Date()): string {
  return getArgDate(date).toISOString();
}
