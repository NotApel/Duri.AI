# Detection integration

Orchard Map and Harvest Logs read the same authenticated backend detections.
Simulation remains separate; failed requests never fall back to invented events.

## History and details

Harvest Logs uses cursor pagination with 20 events per page. The type filter is
server-side; CSV and PDF exports include the displayed page only. Columns remain
Date, Time (MYT), Detection type and Node. Clicking the date opens
`/map/events/:eventId`; direct lookup also works for events outside the first page.
Map lists can load older events. Map filters apply to the currently loaded list.

API values are normalized without fabricating missing measurements, confidence,
coordinates, images or device names. IDs retain BIGINT precision. API failures show
retry/stale states. CSV exports escape cells and neutralize spreadsheet formulas.
Only valid, safe HTTP(S) image URLs are used; unavailable images have a retry state.

Map pins use the latest location reported by each owned node, with report times.
They do not represent an exact fruit position or GPS at detection time. No valid
node coordinates produces an explicit unavailable state rather than sample pins.

## Farmer feedback

- Model REJECTED status still permits farmer review. Status alone is not proof of
  an accepted farmer submission.
- Choose Durian or No Durian. Category is required only for No Durian; comments are
  optional for both and limited to 500 characters. Available category IDs come from
  the API. Durian can be submitted even if the category service is unavailable.
- Optional feedback images are validated as JPEG/PNG, at most 5 MB.
- API ownership is derived from the authenticated farmer, not the submitted ID.
  The legacy `correct_detection` field means true=Durian, false=No Durian; it does
  not mean agreement with the original prediction.
- Accepted feedback is shown from the server after reload, including when browser
  receipts are lost. Account-scoped session receipts remain a supplementary
  acknowledgement. Receipt-storage failure never reports an accepted POST as failed.
- Duplicate submission is blocked under an event row lock. Existing legacy
  duplicates are preserved; no historical data is reset. The model prediction
  remains separate from farmer feedback and the resulting review status.

See [farm management and backend setup](farm-management-backend-setup.md) for the
current endpoints, payloads, migration, device location contract, test commands and
remaining hardware/training/image-serving limitations.
