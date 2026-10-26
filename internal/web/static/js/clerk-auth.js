/**
 * Clerk authentication for IRIS's plain HTML/CSS/JavaScript frontend.
 *
 * Loads the official Clerk UI bundle and ClerkJS from the Frontend API.
 * The Go server exposes only the public publishable key at /api/clerk-config.
 * A missing key leaves the login-page prototype in place; no credentials are
 * submitted to IRIS or stored by the prototype.
 */
(() => {
  "use strict";

  const HOME_URL = "/index.html";
  const LOGIN_URL = "/login.html";
  const SIGNUP_URL = "/signup.html";

  const appearance = {
    variables: {
      colorPrimary: "#25E069",
      colorText: "#171b18",
      colorBackground: "#ffffff",
      borderRadius: "10px"
    },
    elements: {
      cardBox: {
        boxShadow: "none",
        border: "1px solid #e4e9e5"
      },
      formButtonPrimary: {
        backgroundColor: "#25E069",
        color: "#07140b"
      }
    }
  };

  function initials(user) {
    const first = (user.firstName || "").charAt(0);
    const last = (user.lastName || "").charAt(0);
    return (first + last).toUpperCase() || "?";
  }

  function primaryEmail(user) {
    const emails = user.emailAddresses || [];
    if (!emails.length) return "";

    if (user.primaryEmailAddressId) {
      const primary = emails.find(
        (email) => email.id === user.primaryEmailAddressId
      );
      if (primary) return primary.emailAddress || "";
    }

    return emails[0].emailAddress || "";
  }

  function displayName(user) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
    return name || primaryEmail(user) || "User";
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function appendAvatarContents(target, user) {
    const imageURL = user.imageUrl;

    if (imageURL) {
      try {
        const parsed = new URL(imageURL);
        if (parsed.protocol === "https:") {
          const image = document.createElement("img");
          image.src = parsed.href;
          image.alt = "";
          image.loading = "lazy";
          target.appendChild(image);
          return;
        }
      } catch {
        // Use initials if the profile image URL is invalid.
      }
    }

    target.appendChild(element("span", "", initials(user)));
  }

  async function fetchPublishableKey() {
    const response = await fetch("/api/clerk-config", {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    // A 204 response intentionally means Clerk is not configured.
    if (response.status === 204) return null;
    if (!response.ok) {
      throw new Error("Could not fetch the Clerk configuration.");
    }

    const config = await response.json();
    return typeof config.publishableKey === "string"
      ? config.publishableKey.trim()
      : null;
  }

  function frontendDomainFromKey(publishableKey) {
    const match = publishableKey.match(/^pk_(?:test|live)_([A-Za-z0-9_+/=-]+)$/);
    if (!match) throw new Error("The Clerk publishable key has an invalid format.");

    const encodedDomain = match[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const frontendDomain = atob(encodedDomain).replace(/\$$/, "");

    if (!/^[a-z0-9.-]+$/i.test(frontendDomain)) {
      throw new Error("The Clerk Frontend API domain is invalid.");
    }

    return frontendDomain;
  }

  function loadScript(src, attributes = {}) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.crossOrigin = "anonymous";

      Object.entries(attributes).forEach(([name, value]) => {
        script.setAttribute(name, value);
      });

      script.addEventListener("load", resolve, { once: true });
      script.addEventListener(
        "error",
        () => reject(new Error("Failed to load Clerk's browser SDK.")),
        { once: true }
      );

      document.head.appendChild(script);
    });
  }

  async function initializeClerk(publishableKey) {
    const frontendDomain = frontendDomainFromKey(publishableKey);

    // Clerk's prebuilt UI bundle must load before ClerkJS is initialized.
    if (!window.__internal_ClerkUICtor) {
      await loadScript(
        "https://" + frontendDomain + "/npm/@clerk/ui@1/dist/ui.browser.js"
      );
    }

    if (!window.Clerk) {
      await loadScript(
        "https://" + frontendDomain + "/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
        { "data-clerk-publishable-key": publishableKey }
      );
    }

    if (!window.Clerk) {
      throw new Error("ClerkJS loaded without creating the Clerk instance.");
    }

    if (!window.__internal_ClerkUICtor) {
      throw new Error("Clerk's prebuilt UI bundle did not initialize.");
    }

    await window.Clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor }
    });

    return window.Clerk;
  }

  function signInOptions() {
    return {
      appearance,
      forceRedirectUrl: HOME_URL,
      signUpUrl: SIGNUP_URL,
      signUpForceRedirectUrl: HOME_URL
    };
  }

  function signUpOptions() {
    return {
      appearance,
      forceRedirectUrl: HOME_URL,
      signInUrl: LOGIN_URL + "?auth=signin",
      signInForceRedirectUrl: HOME_URL
    };
  }

  function wireLoginButtons(clerk) {
    document.querySelectorAll("[data-auth-mode]").forEach((originalButton) => {
      // site.js also wires the visual prototype. Replace buttons to avoid
      // triggering both handlers when Clerk is configured.
      const button = originalButton.cloneNode(true);
      originalButton.replaceWith(button);

      button.addEventListener("click", () => {
        const mode = button.dataset.authMode || "login";

        if (mode === "signup") {
          clerk.openSignUp(signUpOptions());
        } else {
          clerk.openSignIn(signInOptions());
        }
      });
    });
  }

  function makeSignedInActions(clerk, container, user) {
    const info = element("div", "auth-user-info");
    const avatar = element("div", "auth-user-avatar");
    avatar.title = displayName(user);
    appendAvatarContents(avatar, user);

    info.appendChild(avatar);
    info.appendChild(element("p", "auth-user-name", displayName(user)));
    info.appendChild(element("p", "auth-user-email", primaryEmail(user)));

    const home = element("a", "button button-green", "Go to compressor");
    home.href = HOME_URL;
    home.style.width = "100%";
    home.style.textDecoration = "none";

    const signOut = element("button", "button button-outline", "Sign out");
    signOut.type = "button";
    signOut.style.width = "100%";
    signOut.addEventListener("click", async () => {
      signOut.disabled = true;
      try {
        await clerk.signOut();
        window.location.assign(LOGIN_URL);
      } catch (error) {
        console.error("IRIS: Sign out failed:", error);
        signOut.disabled = false;
      }
    });

    container.replaceChildren(info, home, signOut);
  }

  function makeHeaderControl(clerk, user) {
    if (!user) {
      const actions = element("div", "header-auth-actions");

      const login = element("a", "header-auth-link", "Log in");
      login.href = LOGIN_URL;

      const signup = element("a", "header-auth-link header-auth-signup", "Sign up");
      signup.href = SIGNUP_URL;

      actions.append(login, signup);
      return actions;
    }

    const control = element("div", "header-user-control");
    const avatar = element("button", "header-avatar");
    avatar.type = "button";
    avatar.title = displayName(user);
    avatar.setAttribute("aria-label", "Open account menu");
    avatar.setAttribute("aria-expanded", "false");
    appendAvatarContents(avatar, user);

    const menu = element("div", "header-user-menu");
    menu.hidden = true;
    menu.appendChild(element("p", "user-menu-name", displayName(user)));
    menu.appendChild(element("p", "user-menu-email", primaryEmail(user)));

    const signOut = element("button", "user-menu-signout", "Sign out");
    signOut.type = "button";
    signOut.addEventListener("click", async () => {
      signOut.disabled = true;
      try {
        await clerk.signOut();
        window.location.assign(LOGIN_URL);
      } catch (error) {
        console.error("IRIS: Sign out failed:", error);
        signOut.disabled = false;
      }
    });

    menu.appendChild(signOut);

    avatar.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
      avatar.setAttribute("aria-expanded", String(!menu.hidden));
    });

    control.append(avatar, menu);
    return control;
  }

  function renderHeaderControl(clerk, user) {
    const existing = document.querySelector(
      ".header-auth-actions, .header-user-control"
    );
    const spacer = document.querySelector(".header-spacer");

    if (!existing && !spacer) return;

    const next = makeHeaderControl(clerk, user);
    if (existing) existing.replaceWith(next);
    else spacer.replaceWith(next);
  }

  function renderAuthUI(clerk) {
    const user = clerk.user;
    const actions = document.querySelector(".auth-actions");

    if (actions) {
      if (user) {
        makeSignedInActions(clerk, actions, user);
      } else if (!actions.querySelector("[data-auth-mode]")) {
        const login = element("button", "button button-green auth-open", "Log in");
        login.type = "button";
        login.dataset.authMode = "login";

        const signup = element("button", "button button-outline auth-open", "Sign up");
        signup.type = "button";
        signup.dataset.authMode = "signup";

        actions.replaceChildren(login, signup);
        wireLoginButtons(clerk);
      }
    }

    renderHeaderControl(clerk, user);
  }

  function showAuthError(message) {
    const error = document.getElementById("auth-error");
    if (!error) return;

    error.textContent = message;
    error.hidden = false;
  }

  async function init() {
    const formMount = document.getElementById("clerk-form");

    try {
      const publishableKey = await fetchPublishableKey();

      if (!publishableKey) {
        console.info(
          "IRIS: Clerk is not configured. Set CLERK_PUBLISHABLE_KEY on the Go server."
        );

        if (formMount) {
          showAuthError(
            "Authentication is not configured yet. Set CLERK_PUBLISHABLE_KEY on the Go server."
          );
        }

        // Keep the login-page visual prototype available, but never pretend
        // that prototype submissions create real accounts.
        renderHeaderControl(null, null);
        return;
      }

      const clerk = await initializeClerk(publishableKey);

      // Remove the old prototype dialog only after real Clerk has loaded.
      const oldDialog = document.getElementById("auth-dialog");
      if (oldDialog) oldDialog.remove();

      wireLoginButtons(clerk);
      renderAuthUI(clerk);

      clerk.addListener(() => renderAuthUI(clerk));

      if (formMount) {
        if (clerk.isSignedIn) {
          window.location.replace(HOME_URL);
          return;
        }

        clerk.mountSignUp(formMount, {
          ...signUpOptions(),
          routing: "hash"
        });
      } else {
        const params = new URLSearchParams(window.location.search);
        if (params.get("auth") === "signin") {
          // This query parameter lets the sign-up form's "Log in" link
          // return to the existing split-screen login page and open the modal.
          window.history.replaceState({}, "", window.location.pathname);
          clerk.openSignIn(signInOptions());
        }
      }

      document.addEventListener("click", (event) => {
        document.querySelectorAll(".header-user-menu").forEach((menu) => {
          const control = menu.parentElement;
          if (control && !control.contains(event.target)) {
            menu.hidden = true;
            const avatar = control.querySelector(".header-avatar");
            if (avatar) avatar.setAttribute("aria-expanded", "false");
          }
        });
      });
    } catch (error) {
      console.error("IRIS: Clerk initialization failed:", error);

      if (formMount) {
        showAuthError(
          "Could not load Clerk. Check your publishable key and browser connection, then try again."
        );
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
