// One process-wide rate limiter for every Semantic Scholar call.
//
// researchService and paperValueChainService each used to own a private
// `s2NextSlot` / `s2Queue` pair. The comment justifying that read:
//
//   "Independent counter intentionally so neither feature can starve the
//    other; both are bound by S2's per-IP limit anyway."
//
// The second clause is the reason they must NOT be independent. Sharing a
// per-IP budget while pacing against separate clocks means each queue
// happily emits at the full 1 RPS and the process emits 2 RPS. Opening a
// paper detail panel fires three calls on one queue (citing / references /
// foundational) while a chain regen runs on the other — reliably enough
// traffic to trip 429s and drop both features into 15s backoff.
//
// S2's anonymous tier is ~1 request/second per IP. 1.1s adds enough margin
// that Pulse plus any other client on the same network doesn't tip over.
const S2_MIN_GAP_MS = 1_100

let nextSlot = 0
let queue: Promise<unknown> = Promise.resolve()

async function waitForSlot(): Promise<void> {
  const now = Date.now()
  if (now < nextSlot) {
    await new Promise((resolve) => setTimeout(resolve, nextSlot - now))
  }
  nextSlot = Date.now() + S2_MIN_GAP_MS
}

// Serialize `task` behind the shared queue, after its rate-limit slot.
// The queue advances whether the task resolves or rejects, so one failure
// can't wedge every later S2 call.
export function s2Schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(waitForSlot).then(task)
  queue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}
