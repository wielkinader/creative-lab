// Runs the optimiser off the main thread so the UI never freezes. Posts a
// progress message per committed shape, then a final done message.

import { DEFAULT_CONFIG } from "./config.ts";
import type { StartMessage, WorkerOutMessage } from "./types.ts";
import { runOptimizer } from "./optimizer.ts";

self.onmessage = (e: MessageEvent<StartMessage>) => {
  const msg = e.data;
  if (msg.type !== "start") return;

  let lastSimilarity = 0;
  const shapes = runOptimizer(
    msg.target,
    msg.budget,
    DEFAULT_CONFIG,
    {
      onShape: (shape, similarity) => {
        lastSimilarity = similarity;
        const out: WorkerOutMessage = {
          type: "progress",
          count: shape.index + 1,
          budget: msg.budget,
          similarity,
          shape,
        };
        (self as unknown as Worker).postMessage(out);
      },
    },
    1,
    msg.enabledTypes,
  );

  const done: WorkerOutMessage = { type: "done", shapes, similarity: lastSimilarity };
  (self as unknown as Worker).postMessage(done);
};
