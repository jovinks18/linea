import assert from "node:assert/strict";
import { callConfiguredModel } from "../lib/models/provider.ts";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function restore() {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
}

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

try {
  {
    process.env = {
      ...originalEnv,
      MODEL_PROVIDER: "groq",
      GROQ_API_KEY: "test-groq-key",
      GROQ_MODEL: "test-groq-model",
    };
    let request = null;

    globalThis.fetch = async (url, init) => {
      request = {
        url,
        headers: init.headers,
        body: JSON.parse(init.body),
      };

      return jsonResponse({
        choices: [{ message: { content: "{\"ok\":true}" } }],
      });
    };

    const result = await callConfiguredModel(
      [{ role: "user", content: "Return JSON." }],
      { logFallback: false }
    );

    assert.deepEqual(result, { ok: true });
    assert.equal(
      request.url,
      "https://api.groq.com/openai/v1/chat/completions"
    );
    assert.equal(request.headers.Authorization, "Bearer test-groq-key");
    assert.equal(request.body.model, "test-groq-model");
  }

  {
    process.env = {
      ...originalEnv,
      MODEL_PROVIDER: "groq",
      GROQ_API_KEY: "",
      GROQ_MODEL: "test-groq-model",
    };
    globalThis.fetch = async () => {
      throw new Error("fetch should not be called without a key");
    };

    const result = await callConfiguredModel(
      [{ role: "user", content: "Return JSON." }],
      { logFallback: false }
    );

    assert.equal(result, null);
  }

  {
    process.env = {
      ...originalEnv,
      MODEL_PROVIDER: "openai_compatible",
      MODEL_BASE_URL: "https://provider.example/openai/v1",
      MODEL_API_KEY: "test-provider-key",
      MODEL_NAME: "test-provider-model",
    };
    let requestedUrl = "";

    globalThis.fetch = async (url) => {
      requestedUrl = String(url);

      return jsonResponse({
        choices: [{ message: { content: "{\"ok\":true}" } }],
      });
    };

    await callConfiguredModel([{ role: "user", content: "Return JSON." }], {
      logFallback: false,
    });

    assert.equal(
      requestedUrl,
      "https://provider.example/openai/v1/chat/completions"
    );
  }

  console.log("PASS model provider configuration");
} finally {
  restore();
}
