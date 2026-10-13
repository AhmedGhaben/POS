import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import "./i18n";
import { App } from "./App";
import { ThemeProvider } from "./theme/ThemeProvider";
import { queryClient } from "./lib/query-client";
import { startUserScopedCache } from "./features/auth/user-scope";
import "./styles/globals.css";

startUserScopedCache();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
