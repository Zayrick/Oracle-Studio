import assert from "node:assert/strict";
import { test } from "node:test";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";

import { AccountSettings } from "@/components/account/account-settings";
import { DivinationPageFrame } from "@/components/divination-page-frame";
import {
  AuthDialogProvider,
  AuthDialogTrigger,
} from "@/components/account/auth-dialog";
import { AuthForm } from "@/components/account/auth-form";
import { Dialog, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import {
  accountHref,
  safeRedirect,
  type AuthDialogMode,
} from "@/features/auth/shared";

const user = {
  id: "test-user",
  name: "测试账户",
  email: "account@example.com",
  emailVerified: true,
};

function renderAccount(
  content: ReactNode,
  currentUser: typeof user | null = user,
) {
  const account = { available: true, user: currentUser };
  const loaderData = { account, turnstileSiteKey: "test-public-sitekey" };
  const router = createMemoryRouter(
    [{ id: "root", path: "*", loader: () => loaderData, element: content }],
    {
      initialEntries: ["/settings"],
      hydrationData: { loaderData: { root: loaderData } },
    },
  );
  try {
    return renderToStaticMarkup(<RouterProvider router={router} />);
  } finally {
    router.dispose();
  }
}

test("the global auth dialog does not suppress backdrops of page dialogs", () => {
  // Base UI omits a nested dialog's backdrop even when its parent is closed.
  // This renders in Node, with no browser or dev server.
  const html = renderAccount(
    <AuthDialogProvider>
      <AuthDialogTrigger mode="register">创建账户</AuthDialogTrigger>
      <Dialog defaultOpen>
        <DialogOverlay />
        <DialogTitle>页面内弹窗</DialogTitle>
      </Dialog>
    </AuthDialogProvider>,
  );
  assert.match(html, /data-slot="dialog-overlay"/);
  assert.match(html, /backdrop-blur-sm/);
  assert.match(html, /aria-haspopup="dialog"/);
});

test("account settings expose separate profile, email and reset dialog buttons", () => {
  const html = renderAccount(
    <AuthDialogProvider>
      <AccountSettings />
    </AuthDialogProvider>,
  );
  for (const label of ["编辑信息", "更改邮箱", "重置密码"])
    assert.ok(html.includes(label));
  assert.equal((html.match(/aria-haspopup="dialog"/g) ?? []).length, 3);
  assert.ok(!html.includes("管理你的个人信息"));
  assert.ok(!html.includes('href="/account/forgot-password'));

  const signedOut = renderAccount(
    <AuthDialogProvider>
      <AccountSettings />
    </AuthDialogProvider>,
    null,
  );
  assert.equal((signedOut.match(/aria-haspopup="dialog"/g) ?? []).length, 2);
  assert.ok(signedOut.includes("创建账户"));
  assert.ok(!signedOut.includes('href="/account/login'));
  assert.ok(!signedOut.includes('href="/account/register'));
});

test("AI entry prompts guests to log in while signed-in users can open the chat", () => {
  const content = (
    <AuthDialogProvider>
      <DivinationPageFrame
        form={{ title: "排盘", content: <div>排盘</div> }}
        result={{
          ariaLabel: "排盘结果",
          content: <div>命盘</div>,
          ai: { open: false, onToggle: () => {}, panel: <div>AI 对话</div> },
        }}
      />
    </AuthDialogProvider>
  );
  const guest = renderAccount(content, null);
  assert.ok(guest.includes("询问AI"));
  assert.ok(guest.includes('aria-haspopup="dialog"'));
  const signedIn = renderAccount(content);
  assert.ok(signedIn.includes("询问AI"));
  assert.ok(signedIn.includes('aria-expanded="false"'));
  assert.ok(!signedIn.includes('aria-haspopup="dialog"'));
});

for (const mode of ["login", "register", "forgot-password"] satisfies AuthDialogMode[]) {
  test(`${mode} renders compact dialog fields with the prefilled email`, () => {
    const html = renderAccount(
      <Dialog defaultOpen>
        <AuthForm
          mode={mode}
          initialEmail={user.email}
          turnstileSiteKey="test-public-sitekey"
          dialog={{
            onPendingChange: () => {},
            onSignedIn: async () => {},
            onModeChange: () => {},
          }}
        />
      </Dialog>,
    );
    assert.match(html, /data-slot="dialog-title"/);
    assert.ok(html.includes(`value="${user.email}"`));
    assert.equal(html.includes('name="name"'), mode === "register");
    assert.equal(html.includes('name="password"'), mode !== "register");
    assert.equal(html.includes('name="otp"'), mode !== "login");
    assert.equal(
      html.includes('name="confirmPassword"'),
      mode === "forgot-password",
    );
    assert.ok(!html.includes("返回设置"));
    assert.ok(!html.includes('data-slot="card"'));
    assert.ok(!html.includes('data-slot="dialog-description"'));
    assert.ok(!html.includes("第 1 步，共 2 步"));
    assert.ok(!html.includes("正在自动进行安全验证"));
    assert.ok(!html.includes("href="), "auth modes switch inside the dialog");
    const inputIds = [...html.matchAll(/<input\b[^>]*\bid="([^"]+)"/g)].map(
      (match) => match[1],
    );
    assert.equal(new Set(inputIds).size, inputIds.length);
    for (const id of inputIds) assert.ok(html.includes(`for="${id}"`));
  });
}

test("account links open dialogs and return URLs cannot reopen an auth flow", () => {
  for (const mode of ["login", "register", "forgot-password"] satisfies AuthDialogMode[]) {
    const link = new URL(
      accountHref(mode, { email: user.email, redirectTo: "/history" }),
      "https://example.com",
    );
    assert.equal(link.pathname, "/settings");
    assert.equal(link.searchParams.get("auth"), mode);
    assert.equal(link.searchParams.get("email"), user.email);
    assert.equal(link.searchParams.get("redirectTo"), "/history");
    assert.equal(
      safeRedirect(`/settings?auth=${mode}&email=a%40example.com&redirectTo=%2Fhistory`),
      "/settings",
    );
  }
  assert.equal(safeRedirect("https://untrusted.example"), "/settings");
});
