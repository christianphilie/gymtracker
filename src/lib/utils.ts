import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { AppLanguage, SessionExerciseSet } from "@/db/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatLocalTime(date: Date, language: AppLanguage) {
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatLocalDate(date: Date, language: AppLanguage) {
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function formatSessionDateLabel(value: Date | string, language: AppLanguage) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const today = new Date();
  const diffMs = startOfLocalDay(today).getTime() - startOfLocalDay(date).getTime();
  const dayDiff = Math.round(diffMs / 86_400_000);

  if (dayDiff < 0) {
    return `${formatLocalDate(date, language)}, ${formatLocalTime(date, language)}`;
  }

  if (dayDiff === 0) {
    const prefix = language === "de" ? "Heute" : "Today";
    return `${prefix}, ${formatLocalTime(date, language)}`;
  }

  if (dayDiff === 1) {
    const prefix = language === "de" ? "Gestern" : "Yesterday";
    return `${prefix}, ${formatLocalTime(date, language)}`;
  }

  if (dayDiff === 2) {
    const prefix = language === "de" ? "Vorgestern" : "Day before yesterday";
    return `${prefix}, ${formatLocalTime(date, language)}`;
  }

  if (dayDiff < 14) {
    return language === "de" ? `Vor ${dayDiff} Tagen` : `${dayDiff} days ago`;
  }

  return formatLocalDate(date, language);
}

export function formatNumber(value: number | undefined, fractionDigits = 0) {
  if (value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value);
}

export function formatDurationClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function getSetStatsMultiplier(set: Pick<SessionExerciseSet, "x2Enabled">) {
  return set.x2Enabled ? 2 : 1;
}
