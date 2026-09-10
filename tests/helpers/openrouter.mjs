import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

export function aiTestEnvironment() {
  return {
    OPENROUTER_MANAGEMENT_KEY: "sk-or-test-management-placeholder",
    OPENROUTER_WORKSPACE_ID: "b6bf575e-a29c-4fdd-bfca-c6c29a8b2356",
    AI_KEY_ENCRYPTION_SECRET: randomBytes(32).toString("base64"),
    OPENROUTER_BAZI_PRESET: "bazi",
    OPENROUTER_LIUYAO_PRESET: "liuyao",
  };
}

export function openRouterMock(env) {
  const state = {
    keys: new Map(),
    created: [],
    deleted: [],
    completions: [],
    createOverride: null,
    completionOverride: null,
    deleteOverride: null,
    async fetch(request) {
      if (!request.url.startsWith("https://openrouter.ai/api/v1/"))
        return undefined;
      if (
        request.url === "https://openrouter.ai/api/v1/keys" &&
        request.method === "POST"
      ) {
        assert.equal(
          request.headers.get("authorization"),
          `Bearer ${env.OPENROUTER_MANAGEMENT_KEY}`,
        );
        const body = await request.json();
        assert.deepEqual(Object.keys(body).sort(), ["name", "workspace_id"]);
        assert.equal(body.workspace_id, env.OPENROUTER_WORKSPACE_ID);
        assert.match(body.name, /^oracle-studio\/user\//);
        if (state.createOverride) return state.createOverride(request, body);
        const credential = {
          hash: randomBytes(32).toString("hex"),
          key: `sk-or-v1-test-${randomUUID()}`,
          ...body,
        };
        state.keys.set(credential.hash, credential);
        state.created.push(credential);
        return Response.json(
          {
            key: credential.key,
            data: { hash: credential.hash, workspace_id: body.workspace_id },
          },
          { status: 201 },
        );
      }
      if (request.method === "DELETE") {
        assert.equal(
          request.headers.get("authorization"),
          `Bearer ${env.OPENROUTER_MANAGEMENT_KEY}`,
        );
        if (state.deleteOverride) return state.deleteOverride(request);
        const hash = request.url.split("/").at(-1);
        state.deleted.push(hash);
        state.keys.delete(hash);
        return Response.json({ deleted: true });
      }
      assert.equal(
        request.url,
        "https://openrouter.ai/api/v1/chat/completions",
      );
      const authorization = request.headers.get("authorization");
      const credential = [...state.keys.values()].find(
        (value) => authorization === `Bearer ${value.key}`,
      );
      assert.ok(credential, "inference must use a provisioned user key");
      const body = await request.json();
      assert.equal(credential.name, `oracle-studio/user/${body.user}`);
      assert.equal(request.headers.get("X-OpenRouter-Title"), "Oracle Studio");
      state.completions.push({ body, authorization });
      if (state.completionOverride)
        return state.completionOverride(request, body);
      return sse([{ choices: [{ delta: { content: "测试解读" } }] }]);
    },
    reset() {
      state.keys.clear();
      state.created.length =
        state.deleted.length =
        state.completions.length =
          0;
      state.createOverride =
        state.completionOverride =
        state.deleteOverride =
          null;
    },
  };
  return state;
}

export function sse(chunks) {
  return new Response(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
      "data: [DONE]\n\n",
    {
      headers: { "Content-Type": "text/event-stream" },
    },
  );
}
