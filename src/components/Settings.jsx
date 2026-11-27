import { useState } from "react";
import { Save } from "lucide-react";
import PushSettings from "./PushSettings";
// Keep in sync with CONFIDENCE_THRESHOLD in the backend (.env, default 90).
const CONFIDENCE_THRESHOLD = 90;
export default function Settings() {
  const [saved, setSaved] = useState(false);
  return (
    <div className="ui-page">
      <header className="ui-page-header">
        <h1>Settings</h1>
      </header>
      <PushSettings />
      <section
        className="ui-panel"
        aria-labelledby="detection-threshold-heading"
      >
        <h2 id="detection-threshold-heading">
          Detection confidence threshold: {CONFIDENCE_THRESHOLD}%
        </h2>
        <p className="ui-setting-description">
          Detections below {CONFIDENCE_THRESHOLD}% confidence are marked for
          your review. Your feedback helps improve the model.
        </p>
      </section>
      <p className="ui-notice">
        The preference below is a demonstration only. Offline record
        synchronization is not connected.
      </p>
      <form
        className="ui-panel ui-form settings-grid"
        onChange={() => setSaved(false)}
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(true);
        }}
      >
        <h2>Preferences</h2>
        <label className="ui-setting ui-field" htmlFor="offline-cache">
          <span>
            Offline cache
            <span className="ui-setting-description">
              Offline synchronization is not implemented.
            </span>
          </span>
          <input id="offline-cache" type="checkbox" defaultChecked />
        </label>
        <div>
          <button className="ui-button primary">
            <Save size={18} aria-hidden="true" />
            Save demo preferences
          </button>
        </div>
        {saved && (
          <p className="ui-notice" role="status">
            Demo preferences applied to this form only. They reset when you
            leave this page.
          </p>
        )}
      </form>
    </div>
  );
}