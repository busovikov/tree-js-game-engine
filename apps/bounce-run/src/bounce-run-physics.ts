/** Fixed-step values shared by runtime control and pure route analysis. */
export const BOUNCE_RUN_PHYSICS = Object.freeze({
  fixedDt: 1 / 60,
  forwardSpeed: 6.5,
  lateralSpeed: 4.25,
  lateralResponsiveness: 10,
  bounceHeight: 2.6,
  gravity: 18,
  ballRadius: 0.55,
  edgeSafety: 0.15,
  contactEventLatencyTicks: 1,
  maxSolverTicks: 240,
})
