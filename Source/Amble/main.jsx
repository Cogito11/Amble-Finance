import "./storage.js";
// Fonts ship inside the app (Vite bundles the files), so nothing is fetched from the internet at launch.
// Variable fonts: one file per script covers every weight the CSS asks for. Fraunces also has an
// optical-size axis, which the browser applies automatically.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
