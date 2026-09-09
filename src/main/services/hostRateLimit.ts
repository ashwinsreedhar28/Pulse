// Per-host request pacing.
//
// Generalizes the pattern s2RateLimit.ts already proved: one process-wide
// serialized queue per external host, so independent callers cannot each emit
// at the full rate and collectively exceed a shared per-IP budget.
//
// s2RateLimit stays separate rather than being rewritten in terms of this.
// It carries a long comment explaining a specific incident and is used from
// several hot paths; folding it in would be churn with no behavioural gain.
//
// Every queue advances whether its task resolves or rejects, so one failure
// can never wedge later calls to the same host.

export interface HostLimiter {
  <T>(task: () => Promise<T>): Promise<T>
}

export function createHostLimiter(minGapMs: number): HostLimiter {
  let nextSlot = 0
  let queue: Promise<unknown> = Promise.resolve()

  const waitForSlot = async (): Promise<void> => {
    const now = Date.now()
    if (now < nextSlot) {
      await new Promise((resolve) => setTimeout(resolve, nextSlot - now))
    }
    nextSlot = Date.now() + minGapMs
  }

  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(waitForSlot).then(task)
    queue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}

// OpenAlex's polite pool (identified by `mailto`) allows 10 requests/second.
// 150ms leaves margin without making search feel slow.
export const openAlexSchedule = createHostLimiter(150)

// arXiv's API terms ask for roughly one request every three seconds. Slower
// than anything else here on purpose: it is a courtesy limit on a free public
// service, and every arXiv caller in Pulse is a background refresh or a search
// that already awaits other sources.
export const arxivSchedule = createHostLimiter(3_000)
