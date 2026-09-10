import { z } from "zod";

import {
  OPENROUTER_API_BASE,
  type AIProvisioningEnvironment,
} from "@/features/ai/config.server";

const PROVISIONING_LEASE_MS = 120_000;
const MANAGEMENT_TIMEOUT_MS = 15_000;
const encoder = new TextEncoder();

export type AICredential = {
  keyHash: string;
  encryptedKey: string;
  workspaceId: string;
};

type CredentialRow = {
  key_hash: string | null;
  encrypted_key: string | null;
  workspace_id: string;
};

export class AICredentialError extends Error {
  constructor(
    readonly code:
      | "AI_SETUP_FAILED"
      | "AI_SETUP_IN_PROGRESS"
      | "AI_ACCOUNT_NOT_BOUND",
  ) {
    super(code);
  }
}

function getManagementConfig(env: AIProvisioningEnvironment) {
  const managementKey = env.OPENROUTER_MANAGEMENT_KEY?.trim();
  const workspaceId = env.OPENROUTER_WORKSPACE_ID?.trim();
  if (!managementKey || !z.uuid().safeParse(workspaceId).success) {
    throw new AICredentialError("AI_SETUP_FAILED");
  }
  return { managementKey, workspaceId };
}

async function encryptionKey(env: AIProvisioningEnvironment) {
  try {
    const bytes = decodeBase64(env.AI_KEY_ENCRYPTION_SECRET?.trim() ?? "");
    if (bytes.length !== 32) throw new Error("Invalid encryption key length");
    return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    throw new AICredentialError("AI_SETUP_FAILED");
  }
}

function encodeBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function associatedData(userId: string, workspaceId: string) {
  // Ciphertexts cannot be moved to a different user or workspace.
  return encoder.encode(
    JSON.stringify(["oracle-studio/openrouter/v1", userId, workspaceId]),
  );
}

/** Provisioning is awaited by registration. Never send this key to a browser. */
export async function createAICredential(
  env: AIProvisioningEnvironment,
  userId: string,
): Promise<AICredential> {
  const { managementKey, workspaceId } = getManagementConfig(env);
  const key = await encryptionKey(env);
  let keyHash: string | undefined;
  try {
    const response = await fetch(`${OPENROUTER_API_BASE}/keys`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Authorization: `Bearer ${managementKey}`,
        "Content-Type": "application/json",
      },
      // Keep application identity out of creator_user_id (an OpenRouter org member ID).
      // Spending limits are deliberately not configured by the application yet.
      body: JSON.stringify({
        name: `oracle-studio/user/${userId}`,
        workspace_id: workspaceId,
      }),
      signal: AbortSignal.timeout(MANAGEMENT_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("OpenRouter provisioning failed");
    }
    const payload: unknown = await response.json();
    const identity = z
      .object({ data: z.object({ hash: z.string().min(1) }) })
      .safeParse(payload);
    if (identity.success) keyHash = identity.data.data.hash;
    const parsed = z
      .object({
        key: z.string().min(1),
        data: z.object({ hash: z.string().min(1), workspace_id: z.string() }),
      })
      .parse(payload);
    keyHash = parsed.data.hash;
    if (parsed.data.workspace_id !== workspaceId)
      throw new Error("Workspace mismatch");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: associatedData(userId, workspaceId),
      },
      key,
      encoder.encode(parsed.key),
    );
    return {
      keyHash,
      encryptedKey: `v1.${encodeBase64(iv)}.${encodeBase64(new Uint8Array(ciphertext))}`,
      workspaceId,
    };
  } catch {
    if (keyHash) await discardAICredential(env, keyHash);
    // Upstream bodies may contain credentials; never log or forward them.
    console.error(
      JSON.stringify({ event: "ai_key_provisioning_failed", userId }),
    );
    throw new AICredentialError("AI_SETUP_FAILED");
  }
}

export async function discardAICredential(
  env: AIProvisioningEnvironment,
  keyHash: string,
) {
  try {
    const { managementKey } = getManagementConfig(env);
    const response = await fetch(
      `${OPENROUTER_API_BASE}/keys/${encodeURIComponent(keyHash)}`,
      {
        method: "DELETE",
        redirect: "manual",
        headers: { Authorization: `Bearer ${managementKey}` },
        signal: AbortSignal.timeout(MANAGEMENT_TIMEOUT_MS),
      },
    );
    await response.body?.cancel();
    if (!response.ok && response.status !== 404)
      throw new Error("Key cleanup failed");
  } catch {
    // The hash is an administrative identifier, not the inference credential.
    console.error(JSON.stringify({ event: "ai_key_cleanup_failed", keyHash }));
  }
}

export function insertAICredential(
  db: D1Database,
  userId: string,
  credential: AICredential,
) {
  return db
    .prepare(
      `
    INSERT INTO user_ai_credentials (user_id, key_hash, encrypted_key, workspace_id, updated_at)
    SELECT id, ?, ?, ?, ? FROM "user" WHERE id = ?
  `,
    )
    .bind(
      credential.keyHash,
      credential.encryptedKey,
      credential.workspaceId,
      Date.now(),
      userId,
    );
}

export async function getAICredentialRow(db: D1Database, userId: string) {
  return db
    .prepare(
      `
    SELECT key_hash, encrypted_key, workspace_id FROM user_ai_credentials WHERE user_id = ?
  `,
    )
    .bind(userId)
    .first<CredentialRow>();
}

/** The AI request path only reads existing credentials; it never provisions keys. */
export async function getUserAIKey(
  env: AIProvisioningEnvironment,
  userId: string,
) {
  const row = await getAICredentialRow(env.AUTH_DB, userId);
  if (!row?.key_hash || !row.encrypted_key)
    throw new AICredentialError("AI_ACCOUNT_NOT_BOUND");
  if (row.workspace_id !== env.OPENROUTER_WORKSPACE_ID?.trim()) {
    throw new AICredentialError("AI_SETUP_FAILED");
  }
  try {
    const [version, iv, ciphertext, extra] = row.encrypted_key.split(".");
    if (version !== "v1" || !iv || !ciphertext || extra !== undefined)
      throw new Error("Invalid ciphertext");
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decodeBase64(iv),
        additionalData: associatedData(userId, row.workspace_id),
      },
      await encryptionKey(env),
      decodeBase64(ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new AICredentialError("AI_SETUP_FAILED");
  }
}

/** Existing accounts are upgraded on their next successful sign-in, before issuing a session. */
export async function bindExistingAccountAI(
  env: AIProvisioningEnvironment,
  userId: string,
) {
  const db = env.AUTH_DB;
  const existing = await getAICredentialRow(db, userId);
  if (existing?.key_hash && existing.encrypted_key) return;
  const { workspaceId } = getManagementConfig(env);
  const leaseId = crypto.randomUUID();
  const now = Date.now();
  const claimed = await db
    .prepare(
      `
    INSERT INTO user_ai_credentials (user_id, workspace_id, updated_at, provisioning_id, provisioning_expires_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET provisioning_id = excluded.provisioning_id,
      provisioning_expires_at = excluded.provisioning_expires_at, workspace_id = excluded.workspace_id
    WHERE user_ai_credentials.key_hash IS NULL
      AND COALESCE(user_ai_credentials.provisioning_expires_at, 0) <= ?
    RETURNING user_id
  `,
    )
    .bind(userId, workspaceId, now, leaseId, now + PROVISIONING_LEASE_MS, now)
    .first();
  if (!claimed) {
    if ((await getAICredentialRow(db, userId))?.key_hash) return;
    throw new AICredentialError("AI_SETUP_IN_PROGRESS");
  }
  let credential: AICredential | undefined;
  try {
    credential = await createAICredential(env, userId);
    const saved = await db
      .prepare(
        `
      UPDATE user_ai_credentials SET key_hash = ?, encrypted_key = ?, workspace_id = ?,
        updated_at = ?, provisioning_id = NULL, provisioning_expires_at = NULL
      WHERE user_id = ? AND provisioning_id = ? AND key_hash IS NULL RETURNING user_id
    `,
      )
      .bind(
        credential.keyHash,
        credential.encryptedKey,
        credential.workspaceId,
        Date.now(),
        userId,
        leaseId,
      )
      .first();
    if (!saved) throw new AICredentialError("AI_SETUP_IN_PROGRESS");
  } catch (error) {
    if (credential)
      await discardUnboundAICredential(env, userId, credential.keyHash);
    throw error;
  } finally {
    await db
      .prepare(
        `
      UPDATE user_ai_credentials SET provisioning_id = NULL, provisioning_expires_at = NULL
      WHERE user_id = ? AND provisioning_id = ?
    `,
      )
      .bind(userId, leaseId)
      .run()
      .catch(() => {
        console.error(
          JSON.stringify({ event: "ai_key_claim_release_failed", userId }),
        );
      });
  }
}

/** Do not revoke a committed key if D1 acknowledged a write ambiguously. */
export async function discardUnboundAICredential(
  env: AIProvisioningEnvironment,
  userId: string,
  keyHash: string,
) {
  try {
    const stored = await getAICredentialRow(env.AUTH_DB, userId);
    if (stored?.key_hash !== keyHash) await discardAICredential(env, keyHash);
  } catch {
    console.error(
      JSON.stringify({ event: "ai_key_commit_uncertain", userId, keyHash }),
    );
  }
}
