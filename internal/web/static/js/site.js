(() => {
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");

  if (navToggle && nav) {
    navToggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
      navToggle.setAttribute(
        "aria-label",
        isOpen ? "Close navigation" : "Open navigation"
      );
    });

    document.addEventListener("click", (event) => {
      if (!nav.contains(event.target) && !navToggle.contains(event.target)) {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
        navToggle.setAttribute("aria-label", "Open navigation");
      }
    });
  }

  // Login and sign-up are visual prototypes without a connected auth service.
  const authDialog = document.getElementById("auth-dialog");

  if (authDialog) {
    const authTitle = document.getElementById("auth-title");
    const authForm = document.getElementById("auth-form");
    const authNotice = document.getElementById("auth-notice");
    const authModeToggle = document.getElementById("auth-mode-toggle");
    const authClose = document.getElementById("auth-close");
    const passwordInput = document.getElementById("auth-password");

    let authMode = "login";

    const setAuthMode = (mode) => {
      authMode = mode;
      authTitle.textContent =
        mode === "login" ? "Log in" : "Create your account";

      passwordInput.autocomplete =
        mode === "login" ? "current-password" : "new-password";

      authModeToggle.textContent =
        mode === "login"
          ? "Don't have an account? Sign up"
          : "Already have an account? Log in";

      authNotice.hidden = true;
    };

    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        setAuthMode(button.dataset.authMode || "login");
        authDialog.showModal();
      });
    });

    authModeToggle.addEventListener("click", () => {
      setAuthMode(authMode === "login" ? "signup" : "login");
    });

    authClose.addEventListener("click", () => authDialog.close());

    authDialog.addEventListener("click", (event) => {
      if (event.target === authDialog) authDialog.close();
    });

    authForm.addEventListener("submit", (event) => {
      event.preventDefault();

      authNotice.textContent =
        "Authentication is not connected in this version. No credentials were sent or saved. You can use the compressor without an account.";

      authNotice.hidden = false;
    });
  }

  // Compression UI expects POST /compress from the Go backend.
  const dropzone = document.getElementById("dropzone");
  if (!dropzone) return;

  const fileInput = document.getElementById("file-input");

  const states = {
    idle: document.getElementById("state-idle"),
    selected: document.getElementById("state-selected"),
    progress: document.getElementById("state-progress"),
    success: document.getElementById("state-success"),
    results: document.getElementById("state-results"),
    error: document.getElementById("state-error")
  };

  const chooseFileButton = document.getElementById("choose-file");
  const selectedName = document.getElementById("selected-name");
  const selectedSize = document.getElementById("selected-size");
  const compressButton = document.getElementById("compress-button");
  const replaceButton = document.getElementById("replace-button");
  const progressRing = document.getElementById("progress-ring");
  const progressValue = document.getElementById("progress-value");
  const progressTitle = document.getElementById("progress-title");
  const progressDescription = document.getElementById("progress-description");
  const cancelButton = document.getElementById("cancel-button");
  const resultName = document.getElementById("result-name");
  const originalSizeLabel = document.getElementById("original-size");
  const compressedSizeLabel = document.getElementById("compressed-size");
  const savingsNote = document.getElementById("savings-note");
  const downloadButton = document.getElementById("download-button");
  const anotherButton = document.getElementById("another-button");
  const errorMessage = document.getElementById("error-message");
  const retryButton = document.getElementById("retry-button");
  const errorReplaceButton = document.getElementById("error-replace-button");

  const MAX_FILE_SIZE = 95 * 1024 * 1024;

  let selectedFile = null;
  let compressedBlob = null;
  let compressedFilename = "";
  let activeRequest = null;
  let processingStartedAt = 0;
  let resultTransitionTimer = null;
  let lastErrorWasCancelled = false;

  function showState(name) {
    Object.entries(states).forEach(([key, element]) => {
      if (element) element.hidden = key !== name;
    });
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    if (bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1
    );

    const value = bytes / Math.pow(1024, index);
    const digits =
      index === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;

    return `${value.toFixed(digits)} ${units[index]}`;
  }

  function clearResultTimer() {
    if (resultTransitionTimer !== null) {
      window.clearTimeout(resultTransitionTimer);
      resultTransitionTimer = null;
    }
  }

  function resetProgress() {
    progressRing.classList.remove("is-processing");
    progressRing.style.setProperty("--progress", "0deg");
    progressValue.textContent = "0%";
    progressTitle.textContent = "Uploading your file…";
    progressDescription.textContent = "Sending your file to IRIS.";
  }

  function selectFile(file) {
    if (!file) return;

    clearResultTimer();

    if (file.size > MAX_FILE_SIZE) {
      selectedFile = null;

      showError(
        "This file is larger than the 95 MiB limit. Choose a smaller file to continue."
      );

      retryButton.hidden = true;
      errorReplaceButton.textContent = "Choose another file";
      return;
    }

    selectedFile = file;
    compressedBlob = null;
    compressedFilename = "";

    selectedName.textContent = file.name || "Untitled file";
    selectedSize.textContent = formatBytes(file.size);

    showState("selected");
  }

  function showError(message) {
    errorMessage.textContent = message;
    retryButton.hidden = false;
    retryButton.textContent = "Try again";
    errorReplaceButton.textContent = "Choose another file";
    showState("error");
  }

  function setUploadProgress(percent) {
    const safePercent = Math.max(0, Math.min(99, Math.round(percent)));

    progressValue.textContent = `${safePercent}%`;
    progressRing.style.setProperty("--progress", `${safePercent * 3.6}deg`);

    if (safePercent >= 99) beginProcessingState();
  }

  function beginProcessingState() {
    if (progressRing.classList.contains("is-processing")) return;

    progressValue.textContent = "99%";
    progressRing.style.setProperty("--progress", "356deg");

    window.setTimeout(() => {
      if (!activeRequest) return;

      progressRing.classList.add("is-processing");
      progressTitle.textContent = "Compressing your file…";
      progressDescription.textContent =
        "Applying lossless Zstandard compression.";

      processingStartedAt = performance.now();
    }, 170);
  }

  function safeDownloadName(name) {
    const clean = (name || "file")
      .replace(/[\\/\r\n\0]/g, "_")
      .trim();

    return `${clean || "file"}.zst`;
  }

  function filenameFromDisposition(header, fallback) {
    if (!header) return fallback;

    const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);

    if (utf8Match) {
      try {
        return decodeURIComponent(utf8Match[1].replace(/^"|"$/g, ""));
      } catch {
        // Use fallback.
      }
    }

    const basicMatch = header.match(/filename="?([^";]+)"?/i);

    if (basicMatch) return basicMatch[1].trim();

    return fallback;
  }

  function responseErrorText(blob, status) {
    return blob
      .text()
      .then((text) => {
        const message = text
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (/too large|limit|maximum/i.test(message) || status === 413) {
          return "This file exceeds the server upload limit. Choose a smaller file.";
        }

        if (/busy|unavailable/i.test(message) || status === 503) {
          return "The server is busy. Please try again shortly.";
        }

        return message && message.length < 220
          ? message
          : "Compression failed. Your original file has not been changed.";
      })
      .catch(() => "Compression failed. Your original file has not been changed.");
  }

  async function startCompression() {
    if (!selectedFile || activeRequest) return;

    clearResultTimer();
    resetProgress();
    showState("progress");

    lastErrorWasCancelled = false;

    const xhr = new XMLHttpRequest();

    activeRequest = xhr;
    xhr.open("POST", "/compress", true);
    xhr.responseType = "blob";
    xhr.timeout = 180000;

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || !event.total) return;

      const percent = (event.loaded / event.total) * 100;
      setUploadProgress(percent);
    });

    xhr.upload.addEventListener("load", () => {
      beginProcessingState();
    });

    xhr.addEventListener("load", async () => {
      const responseBlob =
        xhr.response instanceof Blob ? xhr.response : new Blob();

      if (xhr.status < 200 || xhr.status >= 300) {
        const message = await responseErrorText(responseBlob, xhr.status);

        activeRequest = null;
        showError(message);
        return;
      }

      if (!responseBlob.size) {
        activeRequest = null;
        showError("The server returned an empty file. Please try again.");
        return;
      }

      const elapsed = processingStartedAt
        ? performance.now() - processingStartedAt
        : 0;

      const visualHold = Math.max(0, 360 - elapsed);

      window.setTimeout(() => {
        if (activeRequest !== xhr) return;

        const originalBytes = selectedFile.size;
        const compressedBytes = responseBlob.size;

        compressedBlob = responseBlob;

        const disposition = xhr.getResponseHeader("Content-Disposition");

        compressedFilename = filenameFromDisposition(
          disposition,
          safeDownloadName(selectedFile.name)
        );

        if (!compressedFilename.toLowerCase().endsWith(".zst")) {
          compressedFilename += ".zst";
        }

        originalSizeLabel.textContent = formatBytes(originalBytes);
        compressedSizeLabel.textContent = formatBytes(compressedBytes);
        resultName.textContent = compressedFilename;

        if (originalBytes > 0 && compressedBytes < originalBytes) {
          const reduced =
            ((originalBytes - compressedBytes) / originalBytes) * 100;

          savingsNote.textContent =
            `${reduced.toFixed(reduced >= 10 ? 0 : 1)}% smaller`;

          savingsNote.classList.remove("is-neutral");
        } else {
          savingsNote.textContent = "This file did not compress smaller.";
          savingsNote.classList.add("is-neutral");
        }

        activeRequest = null;
        showState("success");

        resultTransitionTimer = window.setTimeout(() => {
          if (!activeRequest) showState("results");
          resultTransitionTimer = null;
        }, 900);
      }, visualHold);
    });

    xhr.addEventListener("error", () => {
      if (activeRequest !== xhr) return;

      activeRequest = null;
      showError(
        "Could not reach the IRIS server. Check that it is running and try again."
      );
    });

    xhr.addEventListener("timeout", () => {
      if (activeRequest !== xhr) return;

      activeRequest = null;
      showError("The request took too long. Please try again with a smaller file.");
    });

    xhr.addEventListener("abort", () => {
      if (activeRequest !== xhr) return;

      activeRequest = null;

      if (lastErrorWasCancelled) showState("selected");
    });

    const formData = new FormData();
    formData.append("file", selectedFile, selectedFile.name || "upload");

    xhr.send(formData);
  }

  function resetToIdle() {
    if (activeRequest) {
      lastErrorWasCancelled = true;

      const request = activeRequest;
      activeRequest = null;
      request.abort();
    }

    clearResultTimer();

    selectedFile = null;
    compressedBlob = null;
    compressedFilename = "";
    fileInput.value = "";

    resetProgress();
    showState("idle");
  }

  chooseFileButton.addEventListener("click", () => fileInput.click());
  replaceButton.addEventListener("click", () => fileInput.click());
  errorReplaceButton.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length) {
      selectFile(fileInput.files[0]);
    }
  });

  compressButton.addEventListener("click", startCompression);
  retryButton.addEventListener("click", startCompression);

  cancelButton.addEventListener("click", () => {
    if (activeRequest) {
      lastErrorWasCancelled = true;

      const request = activeRequest;
      activeRequest = null;
      request.abort();
    }

    showState("selected");
  });

  anotherButton.addEventListener("click", resetToIdle);

  downloadButton.addEventListener("click", () => {
    if (!compressedBlob) return;

    const url = URL.createObjectURL(compressedBlob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      compressedFilename || safeDownloadName(selectedFile?.name);

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.remove("is-dragging");
    });
  });

  dropzone.addEventListener("drop", (event) => {
    if (activeRequest) return;

    const files = event.dataTransfer?.files;

    if (files && files.length) selectFile(files[0]);
  });

  // Prevent dropped files from navigating the browser away from the site.
  ["dragenter", "dragover", "drop"].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      if (eventName === "drop" || eventName === "dragover") {
        event.preventDefault();
      }
    });
  });
})();
