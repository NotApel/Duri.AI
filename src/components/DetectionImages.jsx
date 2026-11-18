import { useEffect, useRef, useState } from "react";
import { API_URL } from "../services/api";
import { fetchDetectionImages } from "../services/detectionApi";

// Terima format backend (id/path/url/sequence/isSelected)
// DAN format DB (image_id/image_path/sequence_number/is_selected).
export function normalizeImages(rows, apiUrl) {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row, index) => {
      const imagePath =
        row.url || row.path || row.image_path || row.image_url || "";
      if (!imagePath) return null;

      // URL penuh (Supabase Storage) guna terus, selain tu cantum dengan API_URL
      const imageUrl = /^https?:\/\//.test(imagePath)
        ? imagePath
        : `${apiUrl.replace(/\/$/, "")}${imagePath.startsWith("/") ? "" : "/"}${imagePath}`;

      return {
        id: row.image_id ?? row.id ?? index + 1,
        sequence: row.sequence_number ?? row.sequence ?? index + 1,
        url: imageUrl,
        isSelected: row.is_selected ?? row.isSelected ?? index === 0,
      };
    })
    .filter(Boolean);
}

export default function DetectionImages({ event }) {
  const [result, setResult] = useState({
    images: [],
    loading: true,
    error: "",
  });
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(0);
  const [broken, setBroken] = useState({});
  const dialog = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setResult({ images: [], loading: true, error: "" });
      setSelected(0);
      try {
        // FIX: array kosong [] bukan "ada data". Hanya guna event.images
        // kalau ada isi, kalau tak fetch dari /api/detections/:id/images
        const hasInline =
          Array.isArray(event.images) && event.images.length > 0;
        const rows =
          !attempt && hasInline
            ? event.images
            : await fetchDetectionImages(event.id, {
                signal: controller.signal,
              });

        if (Array.isArray(rows) && rows.some((row) => row.image_error))
          throw new Error(
            "Image access is temporarily unavailable. Please retry.",
          );

        const images = normalizeImages(rows, API_URL);
        if (!controller.signal.aborted)
          setResult({ images, loading: false, error: "" });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({ images: [], loading: false, error: error.message });
      }
    }
    load();
    return () => controller.abort();
  }, [event.id, event.images, attempt]);

  const image = result.images[selected] || result.images[0];

  return (
    <section className="d-image-viewer" aria-label="Detection images">
      <h3>Detection images</h3>
      {result.loading ? (
        <p role="status">Loading images…</p>
      ) : result.error ? (
        <div role="alert">
          <p>{result.error}</p>
          <button
            className="ui-button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry images
          </button>
        </div>
      ) : !image ? (
        <div role="status">
          <p>
            Camera image unavailable. No usable image was supplied for this
            detection.
          </p>
          <button
            className="ui-button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry images
          </button>
        </div>
      ) : (
        <>
          <figure>
            {broken[image.id] ? (
              <div className="ui-notice" role="status">
                <p>
                  This image could not be loaded. The image may be missing or
                  access may be unavailable.
                </p>
                <button
                  className="ui-button"
                  onClick={() => {
                    setBroken({});
                    setAttempt((value) => value + 1);
                  }}
                >
                  Retry image
                </button>
              </div>
            ) : (
              <img
                src={image.url}
                alt={`Capture ${image.sequence} for detection ${event.id}`}
                referrerPolicy="no-referrer"
                onError={() =>
                  setBroken((previous) => ({ ...previous, [image.id]: true }))
                }
              />
            )}
            <figcaption>
              Image {result.images.indexOf(image) + 1} of {result.images.length}
            </figcaption>
          </figure>
          <div className="d-image-actions">
            {result.images.map((item, index) => (
              <button
                className="ui-button"
                key={item.id}
                aria-pressed={image.id === item.id}
                onClick={() => setSelected(index)}
              >
                Image {index + 1}
              </button>
            ))}
            <button
              className="ui-button"
              disabled={broken[image.id]}
              onClick={() => dialog.current?.showModal()}
            >
              Enlarge image
            </button>
          </div>
          <dialog
            ref={dialog}
            className="d-image-dialog"
            aria-label="Enlarged detection image"
          >
            <form method="dialog">
              <button className="ui-button" autoFocus>
                Close image viewer
              </button>
            </form>
            <img
              src={image.url}
              alt={`Enlarged capture ${image.sequence} for detection ${event.id}`}
              referrerPolicy="no-referrer"
            />
          </dialog>
        </>
      )}
    </section>
  );
}
