import { useState } from "react";
import { Save } from "lucide-react";
export default function Settings() {
  const [saved, setSaved] = useState(false);
  return (
    <div className="ui-page">
      <header className="ui-page-header">
        <h1>Settings</h1>
      </header>
      <p className="ui-notice">
        Demo preferences only. These controls do not enable push notifications,
        offline storage, or change a deployed model.
      </p>
      <form
        className="ui-panel ui-form"
        onChange={() => setSaved(false)}
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(true);
        }}
      >
        <h2>Preferences</h2>
        <label className="ui-setting ui-field" htmlFor="push-alerts">
          <span>
            Push notifications
            <span className="ui-setting-description">
              Not connected in this preview.
            </span>
          </span>
          <input id="push-alerts" type="checkbox" defaultChecked />
        </label>
        <label className="ui-setting ui-field" htmlFor="offline-cache">
          <span>
            Offline cache
            <span className="ui-setting-description">
              Offline synchronization is not implemented.
            </span>
          </span>
          <input id="offline-cache" type="checkbox" defaultChecked />
        </label>
        <label className="ui-field" htmlFor="confidence-threshold">
          Demo confidence threshold
          <select id="confidence-threshold" defaultValue="85">
            <option value="85">Above 85%</option>
            <option value="90">Above 90%</option>
            <option value="95">Above 95%</option>
          </select>
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
