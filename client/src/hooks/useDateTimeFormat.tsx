import { differenceInCalendarDays, differenceInHours, differenceInMinutes, differenceInMonths, differenceInQuarters, differenceInSeconds, differenceInWeeks, differenceInYears } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function useDateTimeFormat() {
  const { i18n } = useTranslation();
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const interval = setInterval(() => forceUpdate({}), 60000);
    return () => clearInterval(interval);
  }, []);

  const relativeTimeFormat = useMemo(() => new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' }), [i18n.language]);
  const relativeDateTimeFormat = useCallback(
    (date: Date, minUnit: Intl.RelativeTimeFormatUnit = 'second') => {
      const now = new Date();
      const diffInYears = differenceInYears(date, now);
      if (Math.abs(diffInYears) > 0 || minUnit === 'year') {
        return relativeTimeFormat.format(diffInYears, 'year');
      }

      const diffInQuarters = differenceInQuarters(date, now);
      if (Math.abs(diffInQuarters) > 0 || minUnit === 'quarter') {
        return relativeTimeFormat.format(diffInQuarters, 'quarter');
      }

      const diffInMonths = differenceInMonths(date, now);
      if (Math.abs(diffInMonths) > 0 || minUnit === 'month') {
        return relativeTimeFormat.format(diffInMonths, 'month');
      }

      const diffInWeeks = differenceInWeeks(date, now);
      if (Math.abs(diffInWeeks) > 0 || minUnit === 'week') {
        return relativeTimeFormat.format(diffInWeeks, 'week');
      }

      const diffInCalendarDays = differenceInCalendarDays(date, now);
      if (Math.abs(diffInCalendarDays) > 0 || minUnit === 'day') {
        return relativeTimeFormat.format(diffInCalendarDays, 'day');
      }

      const diffInHours = differenceInHours(date, now);
      if (Math.abs(diffInHours) > 0 || minUnit === 'hour') {
        return relativeTimeFormat.format(diffInHours, 'hour');
      }

      const diffInMinutes = differenceInMinutes(date, now);
      if (Math.abs(diffInMinutes) > 0 || minUnit === 'minute') {
        return relativeTimeFormat.format(diffInMinutes, 'minute');
      }

      const diffInSeconds = differenceInSeconds(date, now);
      return relativeTimeFormat.format(diffInSeconds, 'second');
    },
    [relativeTimeFormat],
  );

  const formatDateFn = useCallback(
    (date: Date, options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) => {
      return date.toLocaleDateString(i18n.language, options);
    },
    [i18n.language],
  );

  const formatTimeFn = useCallback(
    (date: Date) => {
      return new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' }).format(date);
    },
    [i18n.language],
  );

  const formatWeekdayShort = useCallback(
    (dayOfWeek: number) => {
      // dayOfWeek: 0 = Monday, 1 = Tuesday, ..., 6 = Sunday
      // Create a date for the corresponding day (using a week starting Monday)
      const date = new Date(2024, 0, 1 + dayOfWeek); // Jan 1, 2024 is a Monday
      return new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(date);
    },
    [i18n.language],
  );

  return { relativeDateTimeFormat, formatDate: formatDateFn, formatTime: formatTimeFn, formatWeekdayShort };
}
