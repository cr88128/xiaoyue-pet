import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  calendar: string;
}

const APPLESCRIPT = `
tell application "Calendar"
  set today to current date
  set startOfDay to today - (time of today)
  set endOfDay to startOfDay + (1 * days)
  set out to ""
  repeat with c in calendars
    set calName to name of c
    set theseEvents to (every event of c whose start date ≥ startOfDay and start date < endOfDay)
    repeat with e in theseEvents
      set out to out & summary of e & "\\t" & (start date of e as string) & "\\t" & (end date of e as string) & "\\t" & calName & linefeed
    end repeat
  end repeat
  return out
end tell
`;

export async function fetchTodayEvents(): Promise<CalendarEvent[]> {
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', APPLESCRIPT], { timeout: 10000 });
    const lines = stdout.trim().split('\n').filter((l) => l.trim());
    return lines.map((line) => {
      const [title, start, end, calendar] = line.split('\t');
      return { title: title || '(无标题)', start: start || '', end: end || '', calendar: calendar || '' };
    }).sort((a, b) => a.start.localeCompare(b.start));
  } catch (error) {
    console.error('Failed to fetch calendar events:', error);
    return [];
  }
}
