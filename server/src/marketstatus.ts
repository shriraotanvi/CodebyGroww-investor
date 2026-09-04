// NSE cash market hours: Mon-Fri, 09:15-15:30 IST, with a pre-open session
// 09:00-09:15. Holidays aren't modeled (would just be a static calendar
// lookup in a real system) — weekends are enough to demonstrate the
// "market status" and "stale data outside trading hours" requirements.
export type MarketSession = "pre-open" | "open" | "closed" | "weekend";

export interface MarketStatus {
  session: MarketSession;
  isOpen: boolean;
  istTime: string; // HH:mm for display
  nextTransition: string; // human-readable description of what happens next
}

function getISTParts(date: Date): { day: number; hours: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "00";
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: dayMap[weekdayStr] ?? 1, hours: Number(hourStr) % 24, minutes: Number(minuteStr) };
}

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const { day, hours, minutes } = getISTParts(now);
  const minutesSinceMidnight = hours * 60 + minutes;
  const istTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

  const isWeekend = day === 0 || day === 6;
  const PRE_OPEN_START = 9 * 60;
  const OPEN_START = 9 * 60 + 15;
  const OPEN_END = 15 * 60 + 30;

  if (isWeekend) {
    return { session: "weekend", isOpen: false, istTime, nextTransition: "Opens Monday 09:15 IST" };
  }
  if (minutesSinceMidnight < PRE_OPEN_START) {
    return { session: "closed", isOpen: false, istTime, nextTransition: "Pre-open begins 09:00 IST" };
  }
  if (minutesSinceMidnight < OPEN_START) {
    return { session: "pre-open", isOpen: false, istTime, nextTransition: "Opens 09:15 IST" };
  }
  if (minutesSinceMidnight < OPEN_END) {
    return { session: "open", isOpen: true, istTime, nextTransition: "Closes 15:30 IST" };
  }
  return { session: "closed", isOpen: false, istTime, nextTransition: "Opens tomorrow 09:15 IST (Mon-Fri)" };
}
