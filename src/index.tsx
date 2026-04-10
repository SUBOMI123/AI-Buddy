/* @refresh reload */
import "./styles/theme.css";
import { render } from "solid-js/web";
import App from "./App";
import { RegionSelect } from "./components/RegionSelect";

// Pattern 6: No router package needed — only two routes, detected by hash
// region-select window uses URL "/#/select" per tauri.conf.json
const path = window.location.hash;

if (path === "#/select" || path.startsWith("#/select/")) {
  render(() => <RegionSelect />, document.getElementById("root") as HTMLElement);
} else {
  render(() => <App />, document.getElementById("root") as HTMLElement);
}
