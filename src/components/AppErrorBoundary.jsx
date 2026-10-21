import { Component } from "react";

export default class AppErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error, info) {
    console.error("Duri.AI render error", error, info.componentStack);
  }
  render() {
    if (this.state.failed) {
      return (
        <main className="ui-auth">
          <section className="ui-panel ui-auth-panel" role="alert">
            <h1>Duri.AI couldn’t open this screen</h1>
            <p className="my-4">
              A display error occurred. Reload the app. If it happens again,
              share the first red error in your browser console so we can fix
              it.
            </p>
            <button
              className="ui-button primary"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
            <a className="ui-button ml-2" href="/dashboard">
              Open dashboard
            </a>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
