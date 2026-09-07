import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { after, before, beforeEach, mock, test } from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { hashPassword } from "better-auth/crypto";
import { createAuth } from "../app/features/auth/auth.server.ts";
import {
  applyCloudHistoryChanges,
  handleHistoryRequest,
  listCloudHistory,
} from "../app/features/history/sync.server.ts";
import { migrateLegacyHistoryRecord } from "../app/features/history/legacy.ts";
import { historyRecordSchema } from "../app/features/history/schema.ts";
import { synchronizeHistory } from "../app/features/history/sync.ts";
import {
  readLocalEntry,
  readLocalEntries,
  writeLocalEntry,
  createPendingEntry,
  LEGACY_HISTORY_KEY,
  DATA_STORAGE_PREFIX,
} from "../app/features/history/storage.ts";
import {
  createHistoryRecord,
  deleteHistoryRecord,
  getHistoryRecord,
  listHistoryRecords,
  setHistoryAccount,
  updateHistoryRecord,
  getAccountTheme,
  saveAccountTheme,
} from "../app/lib/history-manager.ts";
import { restoreRawDateTime, toRawDateTime } from "../app/lib/unix-time.ts";
import { restoreBaziHistoryRecord } from "../app/features/bazi/history.ts";
import { restoreLiuyaoHistoryRecord } from "../app/features/liuyao/history.ts";

class MemoryStorage {
  getItem(key) {
    return Object.hasOwn(this, key) ? this[key] : null;
  }
  setItem(key, value) {
    this[key] = String(value);
  }
  removeItem(key) {
    delete this[key];
  }
  clear() {
    for (const key of Object.keys(this)) delete this[key];
  }
}
const storage = new MemoryStorage();
const browser = new EventTarget();
browser.localStorage = storage;
globalThis.window = browser;
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    name: "history-tests",
    modules: true,
    script:
      "export default { fetch() { return new Response(null, { status: 404 }); } }",
    compatibilityDate: "2026-08-14",
    d1Databases: ["AUTH_DB"],
  }),
);
const background = [];
const ctx = { waitUntil: (promise) => background.push(promise) };
const password = "history-test-password";
let env;
let currentUser = "user-a";
let cookies;
let fetchHook;
const requests = [];
const iso = "2026-09-01T12:30:45.987Z";
function legacyRecord(id = "history-legacy", source = "六爻") {
  const ai = {
    activeSessionId: "chat-1",
    sessions: [
      {
        sessionId: "chat-1",
        title: "旧会话",
        createdAt: iso,
        updatedAt: iso,
        messages: [
          { id: 1, role: "user", content: "保留这条消息" },
          {
            id: 2,
            role: "assistant",
            content: "历史解读",
            parts: [{ id: "p1", type: "text", text: "历史解读" }],
            status: "complete",
          },
        ],
      },
    ],
  };
  return {
    id,
    source,
    title: "原始标题",
    createdAt: iso,
    updatedAt: iso,
    content:
      source === "六爻"
        ? {
            schemaVersion: 1,
            question: "测试",
            divinationDate: "2026-09-01",
            divinationTime: "20:30",
            castingMethod: "random",
            yaos: [
              { type: "阴", moving: true },
              ...Array.from({ length: 5 }, () => ({
                type: "阳",
                moving: false,
              })),
            ],
            hexagram: {
              primary: {
                name: "不应保存的卦",
                palace: "乾",
                stage: "本宫",
                pattern: "六冲",
              },
            },
            ai,
          }
        : {
            schemaVersion: 1,
            name: "测试",
            gender: "male",
            birthDate: "1960-02-29",
            birthTime: "23:30",
            chart: { solarText: "旧日期", tymeEightChar: "故意过时的派生数据" },
            ai,
          },
  };
}
function record(id = "history-test", source = "六爻") {
  return migrateLegacyHistoryRecord(legacyRecord(id, source));
}
function mutation(
  value,
  baseRevision = null,
  kind = "upsert",
  mutationId = crypto.randomUUID(),
) {
  return {
    id: value.id,
    mutationId,
    baseRevision,
    kind,
    record: kind === "delete" ? null : value,
  };
}
async function api(
  body,
  {
    user = currentUser,
    account = user,
    origin = "https://example.com",
    method = body ? "POST" : "GET",
    headers = {},
    raw,
  } = {},
) {
  const request = new Request("https://example.com/api/history", {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "X-Account-Id": account,
      ...(user ? { Cookie: cookies[user] } : {}),
      ...headers,
    },
    ...(method !== "GET" ? { body: raw ?? JSON.stringify(body) } : {}),
  });
  return handleHistoryRequest(request, env, ctx);
}

before(async () => {
  env = {
    AUTH_DB: await runtime.getD1Database("AUTH_DB"),
    RESEND_API_KEY: "test",
    AUTH_EMAIL_FROM: "noreply@example.com",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: "https://example.com",
    TURNSTILE_SITE_KEY: "test",
    TURNSTILE_SECRET_KEY: "test",
  };
  for (const name of ["0001_auth.sql", "0002_user_data.sql"]) {
    const sql = await readFile(
      new URL(`../migrations/${name}`, import.meta.url),
      "utf8",
    );
    const statements = sql
      .replace(/^--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    await env.AUTH_DB.batch(statements.map((sql) => env.AUTH_DB.prepare(sql)));
  }
  const hash = await hashPassword(password);
  cookies = {};
  for (const user of ["user-a", "user-b"]) {
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare(
        'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)',
      ).bind(user, user, `${user}@example.com`, iso, iso),
      env.AUTH_DB.prepare(
        'INSERT INTO "account" (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).bind(`account-${user}`, user, "credential", user, hash, iso, iso),
    ]);
    const login = await createAuth(env, ctx).handler(
      new Request("https://example.com/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        body: JSON.stringify({ email: `${user}@example.com`, password }),
      }),
    );
    assert.equal(login.status, 200, await login.clone().text());
    cookies[user] = login.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  }
  mock.method(globalThis, "fetch", async (input, init) => {
    requests.push({ url: input, init });
    if (fetchHook) {
      const response = await fetchHook(input, init);
      if (response) return response;
    }
    return handleHistoryRequest(
      new Request(new URL(input, "https://example.com"), {
        ...init,
        headers: {
          ...init.headers,
          Origin: "https://example.com",
          Cookie: cookies[currentUser],
        },
      }),
      env,
      ctx,
    );
  });
});
beforeEach(async () => {
  await env.AUTH_DB.prepare("DELETE FROM user_data").run();
  storage.clear();
  currentUser = "user-a";
  fetchHook = undefined;
  requests.length = 0;
  setHistoryAccount(null);
});
after(async () => {
  while (background.length) await Promise.all(background.splice(0));
  mock.restoreAll();
  delete globalThis.window;
  await runtime.dispose();
});

test("legacy records become raw input and all application timestamps use integer Unix seconds", () => {
  for (const source of ["八字", "六爻"]) {
    const next = record("history-test", source);
    assert.equal(next.createdAt, 1788265845);
    assert.equal(next.content.schemaVersion, 2);
    assert.equal(next.content.ai.sessions[0].createdAt, next.createdAt);
    assert.equal(next.content.ai.sessions[0].messages[1].content, "历史解读");
    assert.ok(!("chart" in next.content));
    assert.ok(!("hexagram" in next.content));
    assert.ok(!JSON.stringify(next).includes("故意过时"));
    assert.ok(Number.isInteger(next.content.raw.timestamp));
    assert.equal(historyRecordSchema.safeParse(next).success, true);
  }
  assert.equal(record().content.raw.yaoValues.join(""), "677777");
  assert.ok(record("history-bazi", "八字").content.raw.timestamp < 0);
  assert.equal(
    migrateLegacyHistoryRecord({ ...legacyRecord(), createdAt: "broken" }),
    null,
  );
});

test("recalculation preserves original wall date, time and chart across device timezones", () => {
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = "Asia/Shanghai";
    const bazi = record("history-bazi", "八字");
    const liuyao = record();
    const originalBazi = restoreBaziHistoryRecord(bazi);
    const originalLiuyao = restoreLiuyaoHistoryRecord(liuyao);
    for (const timezone of ["UTC", "America/New_York", "Pacific/Auckland"]) {
      process.env.TZ = timezone;
      const nextBazi = restoreBaziHistoryRecord(bazi);
      const nextLiuyao = restoreLiuyaoHistoryRecord(liuyao);
      assert.equal(
        nextBazi.result.tymeEightChar,
        originalBazi.result.tymeEightChar,
      );
      assert.equal(nextBazi.time, "23:30");
      assert.equal(
        nextLiuyao.result.yaoString,
        originalLiuyao.result.yaoString,
      );
      assert.deepEqual(
        nextLiuyao.result.pillars,
        originalLiuyao.result.pillars,
      );
    }
    process.env.TZ = "America/New_York";
    const dst = toRawDateTime(new Date(2026, 2, 8, 12), "02:30");
    assert.equal(restoreRawDateTime(dst).time, "02:30");
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test("login migrates valid records and theme, keeps malformed records and is idempotent", async () => {
  const invalid = { id: "broken", content: "keep me" };
  storage.setItem(
    LEGACY_HISTORY_KEY,
    JSON.stringify({
      version: 2,
      records: [legacyRecord(), legacyRecord("history-bazi", "八字"), invalid],
    }),
  );
  storage.setItem("oracle-studio-theme", "dark");
  setHistoryAccount("user-a");
  await synchronizeHistory("user-a");
  assert.equal(
    (await listCloudHistory(env.AUTH_DB, "user-a", "")).entries.length,
    3,
  );
  assert.deepEqual(JSON.parse(storage.getItem(LEGACY_HISTORY_KEY)).records, [
    invalid,
  ]);
  assert.equal(readLocalEntries(null).length, 0);
  assert.equal(getAccountTheme(), "dark");
  assert.equal(listHistoryRecords().length, 2);
  setHistoryAccount("user-a");
  await synchronizeHistory("user-a");
  assert.equal(
    (await listCloudHistory(env.AUTH_DB, "user-a", "")).entries.length,
    3,
  );
  const rows = await env.AUTH_DB.prepare(
    "SELECT typeof(created_at) AS c, typeof(updated_at) AS u FROM user_data",
  ).all();
  assert.ok(
    rows.results.every((row) => row.c === "integer" && row.u === "integer"),
  );
});

test("failed migration survives logout and cannot be claimed by another account", async () => {
  storage.setItem(
    LEGACY_HISTORY_KEY,
    JSON.stringify({ version: 2, records: [legacyRecord()] }),
  );
  setHistoryAccount("user-a");
  fetchHook = () => {
    throw new TypeError("offline");
  };
  await assert.rejects(synchronizeHistory("user-a"));
  assert.ok(storage.getItem(LEGACY_HISTORY_KEY));
  assert.ok(readLocalEntry("user-a", "history-legacy").pending);
  setHistoryAccount(null);
  assert.equal(listHistoryRecords().length, 0);
  setHistoryAccount("user-b");
  currentUser = "user-b";
  fetchHook = undefined;
  await synchronizeHistory("user-b");
  assert.equal(
    (await listCloudHistory(env.AUTH_DB, "user-b", "")).entries.length,
    0,
  );
  setHistoryAccount("user-a");
  currentUser = "user-a";
  await synchronizeHistory("user-a");
  assert.equal(storage.getItem(LEGACY_HISTORY_KEY), null);
  assert.ok(getHistoryRecord("history-legacy"));
});

test("fresh device downloads raw histories and cloud theme; rename, AI updates and delete sync", async () => {
  await applyCloudHistoryChanges(env.AUTH_DB, "user-a", [
    mutation(record()),
    mutation({ id: "preferences", theme: "light", createdAt: 1, updatedAt: 1 }),
  ]);
  storage.setItem("oracle-studio-theme", "dark");
  setHistoryAccount("user-a");
  await synchronizeHistory("user-a");
  assert.equal(getAccountTheme(), "light");
  const current = getHistoryRecord("history-test");
  const content = structuredClone(current.content);
  content.ai.sessions[0].messages.push({
    id: 3,
    role: "user",
    content: "新增消息",
  });
  updateHistoryRecord(current.id, { title: "云端新标题", content });
  saveAccountTheme("dark");
  await synchronizeHistory("user-a");
  storage.clear();
  setHistoryAccount("user-a");
  await synchronizeHistory("user-a");
  assert.equal(getHistoryRecord(current.id).title, "云端新标题");
  assert.equal(
    getHistoryRecord(current.id).content.ai.sessions[0].messages.at(-1).content,
    "新增消息",
  );
  assert.equal(getAccountTheme(), "dark");
  deleteHistoryRecord(current.id);
  await synchronizeHistory("user-a");
  storage.clear();
  setHistoryAccount("user-a");
  await synchronizeHistory("user-a");
  assert.equal(getHistoryRecord(current.id), undefined);
});

test("late acknowledgement preserves changes made during upload, even within the same second", async () => {
  setHistoryAccount("user-a");
  const initial = createHistoryRecord(record());
  let edited = false;
  fetchHook = async (_input, init) => {
    if (init.method === "POST" && !edited) {
      edited = true;
      updateHistoryRecord(
        initial.id,
        { title: "发送期间的新标题" },
        { touch: false },
      );
    }
  };
  await synchronizeHistory("user-a");
  const cloud = (
    await listCloudHistory(env.AUTH_DB, "user-a", "")
  ).entries.find((entry) => entry.id === initial.id);
  assert.equal(cloud.record.title, "发送期间的新标题");
  assert.equal(readLocalEntry("user-a", initial.id).pending, undefined);
  assert.equal(
    (await listCloudHistory(env.AUTH_DB, "user-a", "")).entries.length,
    1,
  );
});

test("concurrent device edits preserve a sync copy; retries do not duplicate it", async () => {
  const initial = record();
  const created = await applyCloudHistoryChanges(env.AUTH_DB, "user-a", [
    mutation(initial),
  ]);
  setHistoryAccount("user-a");
  await synchronizeHistory("user-a");
  updateHistoryRecord(initial.id, { title: "本机编辑" });
  await applyCloudHistoryChanges(env.AUTH_DB, "user-a", [
    mutation(
      { ...initial, title: "另一设备编辑" },
      created.results[0].entry.revision,
    ),
  ]);
  await synchronizeHistory("user-a");
  await synchronizeHistory("user-a");
  const titles = (
    await listCloudHistory(env.AUTH_DB, "user-a", "")
  ).entries.map((entry) => entry.record.title);
  assert.deepEqual(
    titles.sort(),
    ["另一设备编辑", "本机编辑（同步副本）"].sort(),
  );
});

test("cloud tombstones prevent stale offline updates and repeated legacy imports from resurrection", async () => {
  const initial = record("history-legacy");
  await applyCloudHistoryChanges(env.AUTH_DB, "user-a", [mutation(initial)]);
  setHistoryAccount("user-a");
  await synchronizeHistory("user-a");
  updateHistoryRecord(initial.id, { title: "离线修改" });
  await applyCloudHistoryChanges(env.AUTH_DB, "user-a", [
    mutation(initial, null, "delete"),
  ]);
  await synchronizeHistory("user-a");
  storage.clear();
  storage.setItem(
    LEGACY_HISTORY_KEY,
    JSON.stringify({ version: 2, records: [legacyRecord()] }),
  );
  setHistoryAccount("user-a");
  await synchronizeHistory("user-a");
  assert.equal(listHistoryRecords().length, 0);
  assert.equal(storage.getItem(LEGACY_HISTORY_KEY), null);
  const entries = (await listCloudHistory(env.AUTH_DB, "user-a", "")).entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].record, null);
});

test("API authenticates every request, isolates users, rejects CSRF and invalid times", async () => {
  const change = mutation(record());
  assert.equal((await api({ changes: [change] }, { user: null })).status, 401);
  assert.equal(
    (await api({ changes: [change] }, { account: "user-b" })).status,
    409,
  );
  assert.equal(
    (await api({ changes: [change] }, { origin: "https://untrusted.example" }))
      .status,
    403,
  );
  assert.equal(
    (await api({ changes: [change] }, { raw: "broken" })).status,
    400,
  );
  assert.equal(
    (
      await api({
        changes: [{ ...change, record: { ...change.record, createdAt: iso } }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api({
        changes: [
          { ...change, record: { ...change.record, createdAt: Date.now() } },
        ],
      })
    ).status,
    400,
  );
  assert.equal(
    (await api({ changes: [change] }, { raw: " ".repeat(1_048_577) })).status,
    413,
  );
  assert.equal(
    (
      await api(
        { changes: [change] },
        { headers: { "Content-Type": "text/plain" } },
      )
    ).status,
    415,
  );
  const saved = await api({ changes: [change] });
  assert.equal(saved.status, 200);
  assert.match(saved.headers.get("cache-control"), /no-store/);
  const other = await api(undefined, { user: "user-b" });
  assert.deepEqual((await other.json()).entries, []);
  await api(
    { changes: [mutation(record(), null, "delete")] },
    { user: "user-b" },
  );
  assert.ok(
    (await listCloudHistory(env.AUTH_DB, "user-a", "")).entries[0].record,
  );
});

test("account cookie changed mid-flight never uploads or reads another user's queued data", async () => {
  setHistoryAccount("user-a");
  const pending = createHistoryRecord(record());
  currentUser = "user-b";
  await assert.rejects(synchronizeHistory("user-a"), /账户已/);
  assert.ok(readLocalEntry("user-a", pending.id).pending);
  assert.equal(
    (await listCloudHistory(env.AUTH_DB, "user-b", "")).entries.length,
    0,
  );
});

test("pagination loads all records and identical mutation retries keep one cloud row", async () => {
  for (let index = 0; index < 65; index++) {
    const change = mutation(
      record(`history-${String(index).padStart(3, "0")}`),
    );
    await applyCloudHistoryChanges(env.AUTH_DB, "user-a", [change]);
    await applyCloudHistoryChanges(env.AUTH_DB, "user-a", [change]);
  }
  setHistoryAccount("user-a");
  await synchronizeHistory("user-a");
  assert.equal(listHistoryRecords().length, 65);
  assert.ok(requests.filter((request) => !request.init.method).length >= 3);
});

test("guest deletions stay deleted across reloads and login", async () => {
  storage.setItem(
    LEGACY_HISTORY_KEY,
    JSON.stringify({ version: 2, records: [legacyRecord()] }),
  );
  setHistoryAccount(null);
  assert.equal(deleteHistoryRecord("history-legacy"), true);
  setHistoryAccount(null);
  assert.equal(listHistoryRecords().length, 0);
  setHistoryAccount("user-a");
  await synchronizeHistory("user-a");
  assert.equal(
    (await listCloudHistory(env.AUTH_DB, "user-a", "")).entries.length,
    0,
  );
});

test("existing cloud cache cannot skip legacy upload; backup survives until conflict copy is confirmed", async () => {
  const cloudRecord = { ...record("history-legacy"), title: "云端编辑" };
  await applyCloudHistoryChanges(env.AUTH_DB, "user-a", [
    mutation(cloudRecord),
  ]);
  setHistoryAccount("user-a");
  await synchronizeHistory("user-a");
  storage.setItem(
    LEGACY_HISTORY_KEY,
    JSON.stringify({ version: 2, records: [legacyRecord()] }),
  );
  setHistoryAccount("user-a");
  fetchHook = (_input, init) => {
    if (
      init.method === "POST" &&
      JSON.parse(init.body).changes.some((change) =>
        change.id.startsWith("history-conflict-"),
      )
    )
      throw new Error("offline before copy upload");
  };
  await assert.rejects(synchronizeHistory("user-a"));
  assert.ok(storage.getItem(LEGACY_HISTORY_KEY));
  assert.ok(
    readLocalEntry(null, "history-legacy").migrationTarget.startsWith(
      "history-conflict-",
    ),
  );
  fetchHook = undefined;
  await synchronizeHistory("user-a");
  assert.equal(storage.getItem(LEGACY_HISTORY_KEY), null);
  const entries = (await listCloudHistory(env.AUTH_DB, "user-a", "")).entries;
  assert.equal(entries.length, 2);
  assert.ok(
    entries.some((entry) => entry.record.title === "原始标题（同步副本）"),
  );
});

test("lost response after cloud commit safely retries the same migration", async () => {
  storage.setItem(
    LEGACY_HISTORY_KEY,
    JSON.stringify({ version: 2, records: [legacyRecord()] }),
  );
  setHistoryAccount("user-a");
  let lost = false;
  fetchHook = async (_input, init) => {
    if (init.method === "POST" && !lost) {
      lost = true;
      await applyCloudHistoryChanges(
        env.AUTH_DB,
        "user-a",
        JSON.parse(init.body).changes,
      );
      throw new TypeError("connection lost after commit");
    }
  };
  await assert.rejects(synchronizeHistory("user-a"));
  assert.ok(storage.getItem(LEGACY_HISTORY_KEY));
  await synchronizeHistory("user-a");
  assert.equal(storage.getItem(LEGACY_HISTORY_KEY), null);
  assert.equal(
    (await listCloudHistory(env.AUTH_DB, "user-a", "")).entries.length,
    1,
  );
});

test("aborted account switch ignores a late response and retains original account's outbox", async () => {
  setHistoryAccount("user-a");
  const local = createHistoryRecord(record());
  const controller = new AbortController();
  fetchHook = async (_input, init) => {
    const response = await api(JSON.parse(init.body));
    controller.abort();
    setHistoryAccount("user-b");
    currentUser = "user-b";
    return response;
  };
  await assert.rejects(synchronizeHistory("user-a", controller.signal), {
    name: "AbortError",
  });
  assert.equal(listHistoryRecords().length, 0);
  assert.ok(readLocalEntry("user-a", local.id).pending);
  fetchHook = undefined;
  currentUser = "user-a";
  setHistoryAccount("user-a");
  await synchronizeHistory("user-a");
  assert.equal(readLocalEntry("user-a", local.id).pending, undefined);
});

test("scheduled login sync automatically imports and subsequently uploads new changes", async () => {
  const { startHistorySync, getHistorySyncStatus } =
    await import("../app/features/history/sync.ts");
  const { subscribeHistoryRecords } =
    await import("../app/lib/history-manager.ts");
  const document = new EventTarget();
  document.visibilityState = "visible";
  globalThis.document = document;
  storage.setItem(
    LEGACY_HISTORY_KEY,
    JSON.stringify({ version: 2, records: [legacyRecord()] }),
  );
  setHistoryAccount("user-a");
  const waitForSync = (predicate) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error("automatic sync timed out"));
      }, 5_000);
      const unsubscribe = subscribeHistoryRecords(() => {
        if (getHistorySyncStatus().phase === "synced" && predicate()) {
          clearTimeout(timer);
          unsubscribe();
          resolve();
        }
      });
    });
  let stop;
  try {
    const migrated = waitForSync(
      () => storage.getItem(LEGACY_HISTORY_KEY) === null,
    );
    stop = startHistorySync("user-a");
    await migrated;
    const uploaded = waitForSync(
      () => !readLocalEntry("user-a", "history-legacy").pending,
    );
    updateHistoryRecord("history-legacy", { title: "自动上传" });
    await uploaded;
    assert.equal(
      (await listCloudHistory(env.AUTH_DB, "user-a", "")).entries[0].record
        .title,
      "自动上传",
    );
  } finally {
    stop?.();
    delete globalThis.document;
  }
});
