// Chinese public holidays for DeepSeek's peak schedule.
//
// DeepSeek bills a call as fully off-peak when its UTC calendar date is one of
// these days (see src/peak-hours.ts). The match is the UTC date, the same clock
// the peak windows use (01:00-04:00 and 06:00-10:00 UTC), not China local time.
//
// How to update: when the State Council General Office publishes the next
// year's holiday arrangement (国务院办公厅关于节假日安排的通知), replace that
// year's dates with the announced 放假 days. Include extended 调休 days off.
// Do not include 补班 make-up workdays — those are ordinary weekdays and can
// be peak. Then set CHINESE_PUBLIC_HOLIDAY_UPDATED.
//
// A year with no entry treats its weekdays as peak. That overestimates cost
// until the list is updated; it never applies a discount we cannot source.
//
// Sources, checked 2026-11-01:
// - 2025 and 2026: the in-tree calendar of observed days off (including 调休
//   extensions), originally verified against the State Council announcements
//   on 2026-09-25. Kept as historical coverage for logs from those years.
// - 2027: statutory dates only. The 2024 revision of 《全国年节及纪念日放假办法》
//   (https://www.gov.cn/zhengce/content/202411/content_6986380.htm) sets
//   New Year 1 Jan, Spring Festival eve through lunar day 3, Qingming day,
//   Labour Day 1-2 May, Dragon Boat day, Mid-Autumn day, and National Day
//   1-3 Oct. Mapped onto 2027 with the lunar calendar (Spring Festival eve
//   2027-02-05, Qingming 2027-04-05, Dragon Boat 2027-06-09, Mid-Autumn
//   2027-09-15; cross-checked with timeanddate.com/holidays/china/2027).
//   The 2027 arrangement notice was not published as of 2026-11-01, so
//   compensatory weekdays and golden-week extensions are omitted on purpose.

export const CHINESE_PUBLIC_HOLIDAY_UPDATED = '2026-11-01'

export const CHINESE_PUBLIC_HOLIDAYS: readonly string[] = [
  // 2025: New Year 01-01; Spring Festival 01-28..02-04; Qingming 04-04;
  // Labour Day 05-01..05-05; Dragon Boat 05-31..06-02;
  // Mid-Autumn + National Day 10-01..10-08.
  '2025-01-01',
  '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
  '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
  '2025-04-04',
  '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05',
  '2025-05-31', '2025-06-01', '2025-06-02',
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04',
  '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
  // 2026: New Year 01-01; Spring Festival 02-16..02-22 (eve 02-16);
  // Qingming 04-06; Labour Day 05-01..05-05; Dragon Boat 06-19;
  // Mid-Autumn 09-25; National Day 10-01..10-07.
  '2026-01-01',
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22',
  '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19',
  '2026-09-25',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07',
  // 2027 statutory dates only (arrangement notice not yet published).
  '2027-01-01',
  '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08',
  '2027-04-05',
  '2027-05-01', '2027-05-02',
  '2027-06-09',
  '2027-09-15',
  '2027-10-01', '2027-10-02', '2027-10-03',
]
