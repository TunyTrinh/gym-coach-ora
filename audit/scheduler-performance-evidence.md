# Client Scheduler Performance Evidence

## Baseline and optimized selected-date database read

The repeatable non-mutating scheduler profile ran 30 iterations against the configured database on `2026-08-18`. Before the optimization, the selected-date calendar and room-schedule reads performed independent database reads serially after room metadata, producing a combined p50 of 927.99 ms and p95 of 977.99 ms. The instrumented room-schedule response was 1,016 bytes.

After parallelizing independent closure, booking-overlap, Coach-availability, and calendar reads, the combined p50 was 461.38 ms and p95 was 472.47 ms. The normal selected-date room-schedule response is 730 bytes; the diagnostic response is 988 bytes. The logical Client open has two tRPC operations (weekly calendar plus selected-date schedule), both batchable by the shared transport, and only one room-schedule observer serves both the room-access and Coach sections. A date change has one selected-date operation; immediate neighboring dates are prefetched.

## Public PWA verification status

On August 18, 2026, the first authenticated Client public-PWA check at `/book` returned current room data but continued to serve the preceding bundle after a cache-bypassing refresh. A subsequent public release check confirmed a new bundle and modification timestamp. The authenticated Client PWA then showed room data and the requested visible order: `Home`, `Schedule`, `History`, `Profile`. The Client booking surface no longer displayed two independent schedule fetch states; the room cards and Coach availability section resolved from the single selected-date schedule response.

Installed native-App verification remains pending because no connected device or installed-build session is available in this workspace. The Expo export, type checking, linting, and deterministic regression suite provide the available cross-platform build evidence.
