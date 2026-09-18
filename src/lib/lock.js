// A tiny promise-queue mutex. Every top-level entry point in the service worker
// (messages, tab events, alarms, commands, notification clicks) runs through one
// lock so chrome.storage read-modify-write sequences never interleave.
//
// Internal helpers must NOT call run() themselves: a task that waits on a task
// queued behind it would deadlock. Only wrap entry points.
export function createLock() {
  let tail = Promise.resolve();

  return function run(task) {
    const result = tail.then(() => task());
    // Keep the chain alive even if a task throws.
    tail = result.catch(() => {});
    return result;
  };
}
