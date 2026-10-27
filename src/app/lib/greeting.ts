import { CAFE_TIME_ZONE } from "@/app/lib/cafe-time";

/**
 * The customer app's welcome: a greeting for the time of day (in the café's
 * time zone), "How are you today?", and a warm line that changes from day
 * to day. Computed on the server so the first render and the phone agree.
 */

export type DayPart = "morning" | "afternoon" | "evening" | "night";

export type Greeting = { part: DayPart; title: string; ask: string; message: string };

const TITLES: Record<DayPart, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
  night: "Hello, night owl",
};

const MESSAGES: Record<DayPart, string[]> = {
  morning: [
    "Hope your morning is off to a gentle start.",
    "A warm cup makes every morning better.",
    "Fresh brews are ready when you are.",
  ],
  afternoon: [
    "Take a slow sip and a little break with us.",
    "An afternoon pause never hurt anyone.",
    "Pull up a chair, the coffee is fresh.",
  ],
  evening: [
    "Unwind with something warm.",
    "Slow evenings, good coffee, good company.",
    "The best part of the day starts here.",
  ],
  night: [
    "Late-night cravings? We've got you.",
    "Something warm before the day ends?",
    "Rest easy, the coffee's still warm.",
  ],
};

function cafeClock(now: Date): { hour: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CAFE_TIME_ZONE,
    hour: "numeric",
    day: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { hour: value("hour"), day: value("day") };
}

export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

export function greetingFor(now: Date): Greeting {
  const { hour, day } = cafeClock(now);
  const part = dayPart(hour);
  const messages = MESSAGES[part];
  return { part, title: TITLES[part], ask: "How are you today?", message: messages[day % messages.length] };
}
