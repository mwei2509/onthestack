/** Game state is plain JSON (it is stored as-is in the game's Durable Object), so a JSON round trip copies it exactly. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
