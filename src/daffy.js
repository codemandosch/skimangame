// Shared by physics and the pose preview: entering or leaving the split takes 0.5 s.
export const DAFFY_PHASE_SECONDS = 0.5;

export function updateDaffy(s, held, dt) {
  if (!s.airborne || dt <= 0) return;
  const next = s.daffyProgress + (held ? 1 : -1) * dt / DAFFY_PHASE_SECONDS;
  s.daffyProgress = next < 1e-9 ? 0 : next > 1 - 1e-9 ? 1 : next;
  if (s.daffyProgress === 1) s.daffyExtended = true;
  if (s.daffyProgress === 0 && s.daffyExtended) {
    s.daffyCompleted = true;
    s.daffyExtended = false;
  }
}
