/**
 * Clerk authentication integration for IRIS.
 *
 * Loads ClerkJS from CDN using a publishable key fetched from /api/clerk-config.
 * Provides: sign-in / sign-up via Clerk modal overlays, auth-state UI in the
 * header (avatar + sign-out), and redirect-to-home after authentication.
 *
 * No secret keys are exposed to the browser.
 */
(() => {
  "use strict";

  // ── Helpers ──────────────────────────────────────────────────────────

  function initials(user) {
    const first = (user.firstName || "").charAt(0);
    const last = (user.lastName || "").charAt(0);
    return (first + last).toUpperCase() || "?";
  }

  function displayName(user) {
    const parts = [user.firstName, user.lastName].filter(Boolean);
    return parts.join(" ") || primaryEmail(user) || "User";
  }

  function primaryEmail(user) {
    if (!user.emailAddresses || !user.emailAddresses.length) return "";
    if (user.primaryEmailAddressId) {
      const match = user.emailAddresses.find(
        (e) => e.id === user.primaryEmailAddressId
      );
      if (match) return match.emailAddress;
    }
    return user.emailAddresses[0].emailAddress || "";
  }

  // ── Fetch publishable key from Go backend ───────────────────────────

  async function fetchPublishableKey() {
    try {
      const res = await fetch("/api/clerk-config");
      if (!res.ok) return null;
      const data = await res.json();
      return data.publishableKey || null;
    } catch {
      return null;
    }
  }

  // ── Load ClerkJS from CDN ───────────────────────────────────────────

  function loadClerkScript(publishableKey) {
    return new Promise((resolve, reject) => {
      if (window.Clerk) {
        resolve(window.Clerk);
        return;
      }

      // Extract the frontend API domain from the publishable key.
      // Clerk publishable keys encode the frontend-api domain in base64
      // after the "pk_test_" or "pk_live_" prefix.
      const keyBody = publishableKey.replace(/^pk_(test|live)_/, "");
      let frontendApi;
      try {
        frontendApi = atob(keyBody).replace(/\$$/, "");
      } catch {
        // Fallback: let Clerk figure it out from the key.
        frontendApi = null;
      }

      const src = frontendApi
        ? `https://${frontendApi}/npm/@clerk/clerk-js@latest/dist/clerk.browser.js`
        : "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js";

      const script = document.createElement("script");
      script.src = src;
      script.crossOrigin = "anonymous";
      script.dataset.clerkPublishableKey = publishableKey;
      script.async = true;

      script.addEventListener("load", () => {
        if (window.Clerk) resolve(window.Clerk);
        else reject(new Error("ClerkJS did not expose window.Clerk"));
      });

      script.addEventListener("error", () =>
        reject(new Error("Failed to load ClerkJS from CDN"))
      );

      document.head.appendChild(script);
    });
  }

  // ── Auth-state UI ───────────────────────────────────────────────────

  function renderAuthUI(clerk) {
    const user = clerk.user;

    // Login page: swap buttons when authenticated.
    const authActions = document.querySelector(".auth-actions");
    if (authActions) {
      if (user) {
        authActions.innerHTML = "";

        const info = document.createElement("div");
        info.className = "auth-user-info";
        info.innerHTML = `
          <div class="auth-user-avatar" title="${displayName(user)}">
            ${
              user.imageUrl
                ? `<img src="${user.imageUrl}" alt="${displayName(user)}" />`
                : `<span>${initials(user)}</span>`
            }
          </div>
          <p class="auth-user-name">${displayName(user)}</p>
          <p class="auth-user-email">${primaryEmail(user)}</p>
        `;
        authActions.appendChild(info);

        const goBtn = document.createElement("a");
        goBtn.href = "index.html";
        goBtn.className = "button button-green";
        goBtn.style.width = "100%";
        goBtn.style.textDecoration = "none";
        goBtn.textContent = "Go to compressor";
        authActions.appendChild(goBtn);

        const signOutBtn = document.createElement("button");
        signOutBtn.className = "button button-outline";
        signOutBtn.style.width = "100%";
        signOutBtn.textContent = "Sign out";
        signOutBtn.addEventListener("click", async () => {
          await clerk.signOut();
          window.location.reload();
        });
        authActions.appendChild(signOutBtn);
      }
      // If not authenticated, buttons are already in the HTML.
    }

    // Header user control on non-login pages.
    const headerSpacer = document.querySelector(".header-spacer");
    if (headerSpacer && user) {
      headerSpacer.style.display = "none";

      const control = document.createElement("div");
      control.className = "header-user-control";

      const avatar = document.createElement("button");
      avatar.className = "header-avatar";
      avatar.type = "button";
      avatar.title = displayName(user);
      avatar.setAttribute("aria-label", "User menu");
      avatar.innerHTML = user.imageUrl
        ? `<img src="${user.imageUrl}" alt="" />`
        : `<span>${initials(user)}</span>`;

      const menu = document.createElement("div");
      menu.className = "header-user-menu";
      menu.hidden = true;
      menu.innerHTML = `
        <p class="user-menu-name">${displayName(user)}</p>
        <p class="user-menu-email">${primaryEmail(user)}</p>
        <button class="user-menu-signout" type="button">Sign out</button>
      `;

      avatar.addEventListener("click", () => {
        menu.hidden = !menu.hidden;
      });

      document.addEventListener("click", (e) => {
        if (!control.contains(e.target)) menu.hidden = true;
      });

      menu
        .querySelector(".user-menu-signout")
        .addEventListener("click", async () => {
          await clerk.signOut();
          window.location.reload();
        });

      control.appendChild(avatar);
      control.appendChild(menu);
      headerSpacer.parentNode.replaceChild(control, headerSpacer);
    }
  }

  // ── Wire login-page buttons ─────────────────────────────────────────

  function wireLoginButtons(clerk) {
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      // Remove old event listeners by cloning.
      const fresh = button.cloneNode(true);
      button.parentNode.replaceChild(fresh, button);

      fresh.addEventListener("click", () => {
        const mode = fresh.dataset.authMode || "login";
        if (mode === "signup") {
          clerk.openSignUp({ afterSignUpUrl: "/index.html" });
        } else {
          clerk.openSignIn({ afterSignInUrl: "/index.html" });
        }
      });
    });
  }

  // ── Initialization ──────────────────────────────────────────────────

  async function init() {
    const publishableKey = await fetchPublishableKey();

    if (!publishableKey) {
      // Clerk is not configured. Leave the page as-is (visual prototype).
      console.info(
        "IRIS: Clerk publishable key not configured. Auth buttons will use the visual prototype."
      );
      return;
    }

    // Remove the old auth dialog so it doesn't conflict with Clerk modals.
    const oldDialog = document.getElementById("auth-dialog");
    if (oldDialog) oldDialog.remove();

    try {
      const clerk = await loadClerkScript(publishableKey);
      await clerk.load();

      wireLoginButtons(clerk);
      renderAuthUI(clerk);

      // Listen for session changes.
      clerk.addListener(({ user: updatedUser }) => {
        if (updatedUser) renderAuthUI(clerk);
      });
    } catch (err) {
      console.error("IRIS: Clerk initialization failed:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
