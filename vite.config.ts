import react from "@vitejs/plugin-react-swc";
import externalGlobals from "rollup-plugin-external-globals";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
// `vite build` is the production build. `vite build --mode development`
// (pnpm build:dev) is a development build that Orca can load: it keeps
// development-only code such as debug commands (`import.meta.env.DEV`).
export default defineConfig(({ command, mode }) => {
  const production = command === "build" && mode !== "development";
  return {
    define: {
      "process.env": "{}",
      "process.env.NODE_ENV": JSON.stringify(
        production ? "production" : "development",
      ),
    },
    build: {
      lib: {
        entry: "src/main.tsx",
        fileName: "index",
        formats: ["es"],
      },
      rollupOptions: {
        external: ["react", "react-dom", "valtio"],
      },
    },
    plugins: [
      react({
        // Force the SWC transform path so we can switch JSX to the classic
        // runtime. The automatic runtime pulls in `react/jsx-runtime`, which
        // references `process.env` and `require("react")` and breaks inside
        // Orca's webview. `React` is available as a global instead.
        plugins: [],
        useAtYourOwnRisk_mutateSwcOptions: (options) => {
          if (options.jsc?.transform?.react) {
            options.jsc.transform.react.runtime = "classic";
          }
        },
      }),
      externalGlobals({
        react: "React",
        "react-dom": "ReactDOM",
        valtio: "Valtio",
      }),
    ],
  };
});
