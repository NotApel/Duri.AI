import { useEffect, useRef, useState } from "react";
import { API_URL } from "../services/api";
import { fetchDetectionImages } from "../services/detectionApi";
import { normalizeImages } from "../services/detectionImages";
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
      try {
        const rows =
          event.images ??
          (await fetchDetectionImages(event.id, { signal: controller.signal }));
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
        <p>
          Camera image unavailable. No usable image was supplied for this
          detection.
        </p>
      ) : (
        <>
          <figure>
            {broken[image.id] ? (
              <div className="ui-notice" role="status">
                <p>
                  This image could not be loaded. The image may be missing or
                  access may be unavailable.
                </p>
                <button className="ui-button" onClick={() => setBroken({})}>
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
