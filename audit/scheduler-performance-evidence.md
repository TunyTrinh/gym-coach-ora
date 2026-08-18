# Client Scheduler Performance Evidence

## Baseline and optimized selected-date database read

The repeatable non-mutating scheduler profile ran 30 iterations against the configured database on `2026-08-18`. Before the optimization, the selected-date calendar and room-schedule reads performed independent database reads serially after room metadata, producing a combined p50 of 927.99 ms and p95 of 977.99 ms. The instrumented room-schedule response was 1,016 bytes.

After parallelizing independent closure, booking-overlap, Coach-availability, and calendar reads, the combined p50 was 461.38 ms and p95 was 472.47 ms. The normal selected-date room-schedule response is 730 bytes; the diagnostic response is 988 bytes. The logical Client open has two tRPC operations (weekly calendar plus selected-date schedule), both batchable by the shared transport, and only one room-schedule observer serves both the room-access and Coach sections. A date change has one selected-date operation; immediate neighboring dates are prefetched.

## Public PWA verification status

On August 18, 2026, an authenticated Client public-PWA check at `/book` successfully returned current room data after the checkpoint. However, its visible navigation remained `Home`, `Schedule`, `Profile`, `History` even after a cache-bypassing refresh. This is the previous published artifact, not the current source order. Deployment propagation or public release routing requires further verification before claiming public-PWA navigation parity.
