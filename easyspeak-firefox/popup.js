document.addEventListener("DOMContentLoaded", async () => {
  const importBtn = document.getElementById("importBtn");
  const statusDiv = document.getElementById("status");
  const warningDiv = document.getElementById("warning");

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  const isEasySpeak = /easyspeak|easy-speak|tmclub/i.test(url);

  if (!isEasySpeak) warningDiv.style.display = "block";

  importBtn.addEventListener("click", async () => {
    importBtn.disabled = true;
    setStatus("info", "Scraping agenda...");

    try {
      const results = await browser.tabs.executeScript(tab.id, {
        code: `
          (function() {
            try {
              if (!document.querySelector("table")) return { error: "No agenda table found." };
              return { html: document.documentElement.outerHTML };
            } catch(e) { return { error: e.message }; }
          })();
        `
      });

      const result = results[0];
      if (result?.error) { setStatus("error", result.error); importBtn.disabled = false; return; }
      if (!result?.html) { setStatus("error", "Could not read page."); importBtn.disabled = false; return; }

      // Store in extension storage — editor.html is part of the same extension
      await browser.storage.local.set({ pendingAgenda: { html: result.html } });

      setStatus("success", "✓ Opening editor...");
      await browser.tabs.create({ url: browser.runtime.getURL("editor.html") });
      setTimeout(() => window.close(), 500);

    } catch (err) {
      setStatus("error", "Error: " + err.message);
      importBtn.disabled = false;
    }
  });

  function setStatus(type, msg) { statusDiv.textContent = msg; statusDiv.className = type; }
});
