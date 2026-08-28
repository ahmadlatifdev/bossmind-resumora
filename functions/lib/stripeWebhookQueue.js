/**
 * Throttled Stripe webhook event processor (90 events/sec max).
 * Shared by Firebase Functions and local Express server.
 */
/** @type {import('p-queue').default} */
const PQueue = require('p-queue').default || require('p-queue');

/** @type {Set<string>} */
const processedEventIds = new Set();

/** @type {PQueue} */
const queue = new PQueue({
  concurrency: 10,
  intervalCap: 90,
  interval: 1000,
  carryoverConcurrencyCount: true,
});

/**
 * @param {import('stripe').Stripe.Event} event
 * @param {{ onProcess: (event: import('stripe').Stripe.Event) => Promise<void> }} handlers
 */
function enqueueStripeEvent(event, handlers) {
  const eventId = event && event.id;
  if (!eventId) return { accepted: false, reason: 'missing_event_id' };
  if (processedEventIds.has(eventId)) return { accepted: true, deduplicated: true };

  processedEventIds.add(eventId);
  if (processedEventIds.size > 50000) {
    const iter = processedEventIds.values();
    for (let i = 0; i < 10000; i++) processedEventIds.delete(iter.next().value);
  }

  queue.add(async () => {
    await handlers.onProcess(event);
  });

  return { accepted: true, deduplicated: false, queueSize: queue.size, pending: queue.pending };
}

function getQueueStats() {
  return { size: queue.size, pending: queue.pending };
}

module.exports = { enqueueStripeEvent, getQueueStats, queue };
