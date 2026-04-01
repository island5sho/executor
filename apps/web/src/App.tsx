import React, { Suspense } from "react";
import { RegistryProvider, useAtomValue, Result } from "@effect-atom/atom-react";

import { ExecutorClient } from "./api/client";
import { toolsAtom } from "./api/atoms";

function ToolList() {
  const tools = useAtomValue(toolsAtom());

  if (tools._tag === "Initial" || tools.waiting) {
    return <p>Loading tools…</p>;
  }

  if (tools._tag === "Failure") {
    return <p style={{ color: "red" }}>Failed to load tools</p>;
  }

  return (
    <div>
      <h2>Tools ({tools.value.length})</h2>
      {tools.value.length === 0 ? (
        <p style={{ color: "#888" }}>No tools registered yet.</p>
      ) : (
        <ul>
          {tools.value.map((t) => (
            <li key={t.id}>
              <strong>{t.name}</strong>
              {t.description && <span> — {t.description}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function App() {
  return (
    <RegistryProvider>
      <div style={{ fontFamily: "system-ui", padding: "2rem" }}>
        <h1>Executor</h1>
        <ToolList />
      </div>
    </RegistryProvider>
  );
}
