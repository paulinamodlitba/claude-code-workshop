export function spotsLeft(capacity: number, participantCount: number): number {
  return Math.max(0, capacity - participantCount)
}
