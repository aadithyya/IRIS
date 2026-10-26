/**
 * Clerk authentication for IRIS (plain HTML, CSS, JavaScript + Go).
 *
 * The Go server exposes only CLERK_PUBLISHABLE_KEY through /api/clerk-config.
 * This script never reads environment files and never sends a Clerk secret key
 * to the browser.
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

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function initials(user) {
    return (
      (user.firstName || "").charAt(0) +
      (user.lastName || "").charAt(0)
    ).toUpperCase() || "?";
  }

  function displayName(user) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
    return name || primaryEmail(user) || "User";
  }

  function primaryEmail(user) {
    const addresses = user.emailAddresses || [];

    if (user.primaryEmailAddressId) {
      const primary = addresses.find(
        (address) => address.id === user.primaryEmailAddressId
      );
      if (primary) return primary.emailAddress || "";
    }

    return addresses[0]?.emailAddress || "";
  }

  function addAvatarContents(avatar, user) {
    if (user.imageUrl) {
      try {
        const url = new URL(user.imageUrl);
        if (url.protocol === "https:") {
          const image = element("img");
          image.src = url.href;
          image.alt = "";
          image.loading = "lazy";
          avatar.appendChild(image);
          return;
        }
      } catch {
        // Fall back to initials if the profile image URL is invalid.
      }
    }

    avatar.appendChild(element("span", "", initials(user)));
  }

  async function getPublishableKey() {
    const response = await fetch("/api/clerk-config", {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    if (response.status === 204) return null;
    if (!response.ok) throw new Error("Could not load Clerk configuration.");

    const config = await response.json();
    const key = config.publishableKey;

    if (typeof key !== "string" || !/^pk_(test|live)_/.test(key)) {
      throw new Error("CLERK_PUBLISHABLE_KEY is missing or invalid.");
    }

    return key;
  }

  function getFrontendDomain(publishableKey) {
    const encodedDomain = publishableKey.split("_")[2];
    if (!encodedDomain) throw new Error("Invalid Clerk publishable key.");

    const base64 = encodedDomain.replace(/-/g, "+").replace(/_/g, "/");
    const domain = atob(base64).replace(/\$$/, "");

    if (!/^[a-z0-9.-]+$/i.test(domain)) {
      throw new Error("The Clerk Frontend API domain is invalid.");
    }

    return domain;
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
        () => reject(new Error("Failed to load a Clerk browser script.")),
        { once: true }
      );
      document.head.appendChild(script);
    });
  }

  async function initializeClerk(publishableKey) {
    const domain = getFrontendDomain(publishableKey);

    // Clerk's prebuilt UI bundle must load before ClerkJS.
    if (!window.__internal_ClerkUICtor) {
      await loadScript(
        "https://" + domain + "/npm/@clerk/ui@1/dist/ui.browser.js"
      );
    }

    if (!window.Clerk) {
      await loadScript(
        "https://" + domain + "/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
        { "data-clerk-publishable-key": publishableKey }
      );
    }

    if (!window.Clerk) throw new Error("ClerkJS did not initialize.");
    if (!window.__internal_ClerkUICtor) {
      throw new Error("Clerk's prebuilt UI bundle did not initialize.");
    }

    await window.Clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor }
    });

    return window.Clerk;
  }

  function sharedAuthOptions() {
    return {
      appearance,
      forceRedirectUrl: HOME_URL
    };
  }

  function signInOptions() {
    return {
      ...sharedAuthOptions(),
      signUpUrl: SIGNUP_URL,
      signUpForceRedirectUrl: HOME_URL
    };
  }

  function signUpOptions() {
    return {
      ...sharedAuthOptions(),
      signInUrl: LOGIN_URL,
      signInForceRedirectUrl: HOME_URL
    };
  }

  function renderAccountControl(clerk) {
    const user = clerk.user;
    const existing = document.querySelector(
      ".header-auth-actions, .header-user-control"
    );
    const spacer = document.querySelector(".header-spacer");

    if (!existing && !spacer) return;

    let replacement;

    if (!user) {
      replacement = element("div", "header-auth-actions");

      const login = element("a", "header-auth-link", "Log in");
      login.href = LOGIN_URL;

      const signup = element(
        "a",
        "header-auth-link header-auth-signup",
        "Sign up"
      );
      signup.href = SIGNUP_URL;

      replacement.append(login, signup);
    } else {
      replacement = element("div", "header-user-control");

      const avatar = element("button", "header-avatar");
      avatar.type = "button";
      avatar.title = displayName(user);
      avatar.setAttribute("aria-label", "Open account menu");
      avatar.setAttribute("aria-expanded", "false");
      addAvatarContents(avatar, user);

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

      replacement.append(avatar, menu);
    }

    if (existing) existing.replaceWith(replacement);
    else spacer.replaceWith(replacement);
  }

  function renderLoginPanel(clerk) {
    const actions = document.querySelector(".auth-actions");
    if (!actions) return;

    if (clerk.user) {
      const info = element("div", "auth-user-info");
      const avatar = element("div", "auth-user-avatar");
      avatar.title = displayName(clerk.user);
      addAvatarContents(avatar, clerk.user);
      info.append(
        avatar,
        element("p", "auth-user-name", displayName(clerk.user)),
        element("p", "auth-user-email", primaryEmail(clerk.user))
      );

      const home = element("a", "button button-green", "Go to compressor");
      home.href = HOME_URL;
      home.style.width = "100%";
      home.style.textDecoration = "none";

      const signOut = element("button", "button button-outline", "Sign out");
      signOut.type = "button";
      signOut.style.width = "100%";
      signOut.addEventListener("click", async () => {
        try {
          await clerk.signOut();
          window.location.assign(LOGIN_URL);
        } catch (error) {
          console.error("IRIS: Sign out failed:", error);
        }
      });

      actions.replaceChildren(info, home, signOut);
    }
  }

  function showConfigurationMessage(message) {
    const error = document.getElementById("auth-error");
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
  }

  async function init() {
    const mount = document.getElementById("clerk-form");
    const pageMode = document.body.dataset.authMode === "signup"
      ? "signup"
      : "signin";

    try {
      const publishableKey = await getPublishableKey();

      if (!publishableKey) {
        console.info(
          "IRIS: Clerk is not configured. Set CLERK_PUBLISHABLE_KEY for the Go server."
        );

        if (mount) {
          showConfigurationMessage(
            "Authentication is not configured yet. Set CLERK_PUBLISHABLE_KEY on the Go server."
          );
        }
        return;
      }

      const clerk = await initializeClerk(publishableKey);

      // Remove the old visual-only dialog only after Clerk initialized.
      const oldDialog = document.getElementById("auth-dialog");
      if (oldDialog) oldDialog.remove();

      renderAccountControl(clerk);
      renderLoginPanel(clerk);

      clerk.addListener(() => {
        renderAccountControl(clerk);
        renderLoginPanel(clerk);
      });

      if (mount) {
        if (clerk.isSignedIn) {
          window.location.replace(HOME_URL);
          return;
        }

        if (pageMode === "signup") {
          clerk.mountSignUp(mount, {
            ...signUpOptions(),
            routing: "hash"
          });
        } else {
          clerk.mountSignIn(mount, {
            ...signInOptions(),
            routing: "hash"
          });
        }
      }
    } catch (error) {
      console.error("IRIS: Clerk initialization failed:", error);
      if (mount) {
        showConfigurationMessage(
          "Clerk could not load. Check the publishable key and your network connection, then reload this page."
        );
      }
    }

    // Close the account menu when clicking outside it.
    document.addEventListener("click", (event) => {
      document.querySelectorAll(".header-user-control").forEach((control) => {
        if (!control.contains(event.target)) {
          const menu = control.querySelector(".header-user-menu");
          const avatar = control.querySelector(".header-avatar");
          if (menu) menu.hidden = true;
          if (avatar) avatar.setAttribute("aria-expanded", "false");
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
