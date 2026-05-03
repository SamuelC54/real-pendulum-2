# Hardware smoke checklist (Teknic rail jog)

Use this after changes to **`teknic_motor`**, **`motor.proto`**, motion limits in **`TeknicCfg`**, or anything that affects hub access or velocity commands. Automated tests do not replace eyes-on safety.

## Before powering motion

1. **ClearView closed** — only one process may own the SC4-HUB port.
2. **Travel clear** — no collisions; mechanical limits / e-stops as appropriate for your bench.
3. **Operator position** — hand near e-stop or power if fitted.

## Sequence

| Step | Action | Pass criteria |
|------|--------|----------------|
| 1 | Start stack (`npm run dev`) | `motor-grpc` listens; no immediate crash. |
| 2 | **Connect motor** in UI | Status shows connected or a clear error (not a silent hang). |
| 3 | **GetStatus / motor info** | Node index, model/serial look plausible; no bogus zeros everywhere if the hub reports data. |
| 4 | **Bounded jog** | Small commanded RPM; cart moves in correct direction; **release** / **Stop** zeroes command. |
| 5 | **Window blur / pointer release** | Per UI design, jog should stop when releasing controls or leaving the window (verify once). |
| 6 | **Fault injection** (optional, idle only) | Disconnect USB — service should report failure **without** taking down Node unexpectedly. |

## grpcurl (optional)

With `motor-grpc` listening on `127.0.0.1:50051` and `.proto` on disk:

```bash
grpcurl -plaintext -import-path proto -proto motor.proto localhost:50051 motor.v1.MotorService/GetStatus
```

Use the repo’s `proto/motor.proto` path as `-import-path` / `-proto` arguments from the repository root.

---

## Related

- [Testing strategy](./testing-strategy.md) — automated layers vs this manual pass.
