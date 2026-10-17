/**
 * Délai avant la prochaine interrogation d'une génération réelle. Plus elle dure, moins on interroge (un workflow peut
 * prendre dix minutes) ; onglet masqué, on ralentit encore. Pur : testable sans navigateur.
 */
export function pollDelay(ageMs, hidden = false) {
  if (hidden) return 30_000
  if (ageMs < 15_000) return 2_000
  if (ageMs < 60_000) return 4_000
  if (ageMs < 300_000) return 8_000
  return 15_000
}

/** Les générations à interroger maintenant : celles dont le dernier appel est plus ancien que leur délai. */
export function dueJobs(jobs, last, now, hidden = false) {
  return jobs.filter((j) => now - (last.get(j.id) ?? 0) >= pollDelay(now - (j.createdAt ?? now), hidden))
}
