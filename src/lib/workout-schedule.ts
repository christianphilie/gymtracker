import { WORKOUT_SCHEDULE_DAYS, type AppLanguage, type WorkoutScheduleDay, type WeekStartsOn } from "@/db/types";

const workoutScheduleDaySet = new Set<WorkoutScheduleDay>(WORKOUT_SCHEDULE_DAYS);

export function isWorkoutScheduleDay(value: unknown): value is WorkoutScheduleDay {
  return typeof value === "string" && workoutScheduleDaySet.has(value as WorkoutScheduleDay);
}

export function normalizeWorkoutScheduledDays(values: Iterable<unknown> | undefined): WorkoutScheduleDay[] {
  if (!values) {
    return [];
  }

  const uniqueDays = new Set<WorkoutScheduleDay>();
  for (const value of values) {
    if (isWorkoutScheduleDay(value)) {
      uniqueDays.add(value);
    }
  }

  return WORKOUT_SCHEDULE_DAYS.filter((day) => uniqueDays.has(day));
}

export function getOrderedWorkoutScheduleDays(weekStartsOn: WeekStartsOn) {
  if (weekStartsOn === "sun") {
    return (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const).slice();
  }

  return [...WORKOUT_SCHEDULE_DAYS];
}

export function getCurrentWorkoutScheduleDay(date: Date) {
  const day = date.getDay();
  if (day === 0) {
    return "sun" as const;
  }

  return WORKOUT_SCHEDULE_DAYS[day - 1];
}

export function formatWorkoutScheduleDayLabel(day: WorkoutScheduleDay, language: AppLanguage) {
  const dayIndex = WORKOUT_SCHEDULE_DAYS.indexOf(day);
  const labelDate = new Date(2024, 0, 1 + dayIndex);
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", { weekday: "short" })
    .format(labelDate)
    .replace(/\.$/, "");
}
