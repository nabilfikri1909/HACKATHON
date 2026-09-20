import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "framer-motion";
import App from "./App.jsx";
import "./styles.css";

class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error("HabitStake interface error:", error);
  }
  render() {
    if (this.state.failed)
      return (
        <main className="mx-auto max-w-xl px-6 py-24 text-white">
          <h1 className="text-3xl font-semibold">
            The interface needs a refresh.
          </h1>
          <p className="mt-4 text-slate-300">
            Your on-chain commitment is unchanged. A browser error cannot cancel
            a check-in deadline. If a transaction was pending, check its status
            in your wallet before trying again.
          </p>
          <button
            className="mt-8 rounded-xl bg-[#00ff00] px-6 py-3 font-semibold text-black"
            onClick={() => window.location.reload()}
          >
            Reload HabitStake
          </button>
        </main>
      );
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </ErrorBoundary>
  </React.StrictMode>,
);
