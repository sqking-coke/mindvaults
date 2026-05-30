/**
 * 日期时间格式化工具。
 * 输入：ISO 8601 字符串（如 "2026-05-30T22:44:45.828239+00:00"）
 */

/** "2026-05-30 22:44" */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return iso.replace("T", " ").substring(0, 16);
}

/** "05-30 22:44" */
export function formatDateShort(iso?: string | null): string {
  if (!iso) return "—";
  return iso.replace("T", " ").substring(5, 16);
}

/** "2026-05-30 22:44:45" */
export function formatDateTimeFull(iso?: string | null): string {
  if (!iso) return "—";
  return iso.replace("T", " ").substring(0, 19);
}

/** 当前时间的 ISO 字符串 */
export function nowISO(): string {
  return new Date().toISOString();
}
