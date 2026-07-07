// Modified by Friday AI Team - Cloud auth stripped (local-only mode)
/**
 * Always returns false - cloud team membership check disabled in local-only mode
 */
export function isFridayTeamMember(_email?: string): boolean {
  return false;
}
