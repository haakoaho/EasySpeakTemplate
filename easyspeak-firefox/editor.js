// ─── Constants ────────────────────────────────────────────────────────────
const SLIDES_BASE   = "https://haakoaho.github.io/Oslo-Toastmaters-Meeting";
const SLIDES_URL    = SLIDES_BASE + "/1";
const PRESENTER_URL = SLIDES_BASE + "/presenter/1";
const STORAGE_KEY   = "slidev_agenda_data";  // matches what the slides app reads

// ─── Scraping helpers ─────────────────────────────────────────────────────
function extractTime(text) {
  if (!text) return "";
  const patterns = [
    /(\d{1,2}:\d{2})\s*(?:to|-|–|—)\s*(\d{1,2}:\d{2})/i,
    /(\d{1,2})\s*(?:to|-|–|—)\s*(\d{1,2})\s*min/i,
    /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i,
    /(\d{1,2})\s*min/i,
    /(\d{1,2}:\d{2})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return (m[2] ? m[1] + " to " + m[2] : m[1]).trim();
  }
  return "";
}

function collectTimesFromElement(el, timeRegex) {
  const found = [];
  for (const c of Array.from(el.querySelectorAll("span, td"))) {
    const text = (c.textContent || "").trim();
    if (!text) continue;
    timeRegex.lastIndex = 0;
    let m;
    while ((m = timeRegex.exec(text)) !== null) found.push(m[0].trim());
  }
  return found;
}

function findTimeInRow(row) {
  if (!row) return "";
  const tds = Array.from(row.querySelectorAll("td"));
  const re = /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?|\d{1,2}\s*min)/g;
  for (const td of tds) {
    if (td.querySelector("table")) {
      const found = collectTimesFromElement(td, re);
      if (found.length >= 2) return `${found[0]} to ${found[found.length - 1]}`;
      if (found.length === 1) return found[0];
    }
  }
  for (let i = 1; i < tds.length; i++) {
    const found = collectTimesFromElement(tds[i], re);
    if (found.length >= 2) return `${found[0]} to ${found[found.length - 1]}`;
    if (found.length === 1) return found[0];
  }
  const rowText = tds.slice(1).map(td => td.textContent || "").join(" ");
  return extractTime(rowText || row.textContent || "");
}

function scrapeEasySpeakAgenda(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const meetingInfo = {};
  meetingInfo.club_name = doc.querySelector("a.maintitle")?.textContent.trim() ?? "";

  const agenda_items = [];
  const speakers = [];

  doc.querySelectorAll("table tr").forEach((r) => {
    const tds = r.querySelectorAll("td");
    if (tds.length < 5) return;
    const role      = tds[1]?.innerText.trim() || "";
    const presenter = tds[2]?.innerText.trim() || "";
    const event     = tds[3]?.innerText.trim() || "";

    if (role.includes("Speaker")) {
      let project = "", time = "";
      const italic = r.querySelector("i, em, strong, b");
      if (italic?.textContent?.trim()) {
        project = italic.textContent.trim();
      } else {
        const next = r.nextElementSibling;
        if (next) {
          const nextTds = next.querySelectorAll("td");
          if (nextTds.length <= 2 || nextTds.length < 5) {
            const h = next.innerHTML || "";
            const firstPartHtml = h.split(/<br\s*\/?/i)[0] || h;
            const tmp = document.createElement("div");
            tmp.innerHTML = firstPartHtml;
            const candidate = (tmp.textContent || tmp.innerText || "").trim();
            if (candidate) {
              const descStarters = ["Deliver","Demonstrate","Demonstrates","Provides","Learn","Learners","Participants","This project","By the end","Tell","Use","Explain","Discuss"];
              let cut = candidate;
              for (const s of descStarters) {
                const idx = cut.indexOf(s);
                if (idx > 10) { cut = cut.slice(0, idx).trim(); break; }
              }
              project = cut;
            }
          }
        }
      }
      let project_description = "";
      if (project) {
        const splitRe = /\s[-–—]\s/;
        if (splitRe.test(project)) {
          const parts = project.split(splitRe);
          project = (parts[0] || "").trim();
          project_description = (parts.slice(1).join(" - ") || "").trim();
        } else if (project.includes("-")) {
          const idx = project.indexOf("-");
          if (idx > 0) { project_description = project.slice(idx + 1).trim(); project = project.slice(0, idx).trim(); }
        }
      }
      time = findTimeInRow(r) || extractTime((event||"") + " " + (project||"") + " " + (project_description||""));
      speakers.push({ name: presenter, title: event, project, project_description, time });
    }
    agenda_items.push({ role, presenter, event });
  });

  return { meeting_info: meetingInfo, agenda_items, speakers };
}

function getStructuredRoles(meetingData) {
  const roles = {};
  for (const item of meetingData.agenda_items) {
    if (!item.role || item.role === "Break" || !item.presenter ||
        item.presenter.toLowerCase() === "tba" || item.role.includes("Speaker")) continue;
    roles[item.role.replace(/\s|&/g, "")] = { presenter: item.presenter };
  }
  return roles;
}

// ─── UI helpers ───────────────────────────────────────────────────────────
const ALL_ROLES = [
  "President", "Toastmaster", "General Evaluator", "Table Topic Master",
  "Timer", "Grammarian & Word of the Day", "Ah & Vote Counter", "Table Topics Evaluator",
];

let lastParsedAgenda = null;

function setStatus(type, msg) {
  const s = document.getElementById("status");
  s.textContent = msg;
  s.className = type;
}

function createLabeledInput(labelText, value, key) {
  const wrapper = document.createElement("div");
  wrapper.className = "field-row";
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.dataset.key = key;
  wrapper.appendChild(label);
  wrapper.appendChild(input);
  return wrapper;
}

function populateEditors(agenda) {
  const rolesEditor    = document.getElementById("rolesEditor");
  const speakersEditor = document.getElementById("speakersEditor");
  rolesEditor.innerHTML    = "<h3>Meeting Roles</h3>";
  speakersEditor.innerHTML = "<h3>Speeches</h3>";

  const parsedRoles = agenda.structured_roles || {};
  ALL_ROLES.forEach((roleName) => {
    const key = roleName.replace(/\s|&/g, "");
    rolesEditor.appendChild(createLabeledInput(roleName, parsedRoles[key]?.presenter || "", roleName));
  });

  const evalMap = {};
  agenda.agenda_items.forEach((item) => {
    if ((item.role || "").toLowerCase().includes("evaluator")) {
      const m = (item.role || "").match(/^(\d+)/);
      const idx = m ? parseInt(m[1], 10) - 1 : -1;
      evalMap[idx] = item.presenter;
    }
  });

  (agenda.speakers || []).forEach((speaker, index) => {
    const card = document.createElement("div");
    card.className = "speech-card";
    card.dataset.index = index;
    const t = document.createElement("h4");
    t.textContent = `Speech ${index + 1}`;
    card.appendChild(t);
    card.appendChild(createLabeledInput("Speaker",             speaker.name,                "name"));
    card.appendChild(createLabeledInput("Speech Title",        speaker.title,               "title"));
    card.appendChild(createLabeledInput("Project",             speaker.project || "",       "project"));
    card.appendChild(createLabeledInput("Project Description", speaker.project_description || "", "project_description"));
    card.appendChild(createLabeledInput("Time",                speaker.time || "",          "time"));
    card.appendChild(createLabeledInput("Evaluator",           evalMap[index] || "",        "evaluator"));
    speakersEditor.appendChild(card);
  });

  const addBtn = document.createElement("button");
  addBtn.textContent = "+ Add Speaker";
  addBtn.className = "secondary";
  addBtn.addEventListener("click", () => {
    const idx = speakersEditor.querySelectorAll(".speech-card").length;
    const card = document.createElement("div");
    card.className = "speech-card";
    card.dataset.index = idx;
    const t = document.createElement("h4");
    t.textContent = `Speech ${idx + 1}`;
    card.appendChild(t);
    ["name", "title", "evaluator"].forEach(k =>
      card.appendChild(createLabeledInput(k.charAt(0).toUpperCase() + k.slice(1), "", k))
    );
    speakersEditor.appendChild(card);
  });
  speakersEditor.appendChild(addBtn);

  document.getElementById("editorContainer").style.display = "block";
}

function collectEdits() {
  const structured_roles = {};
  document.querySelectorAll("#rolesEditor .field-row").forEach((row) => {
    const input = row.querySelector("input");
    structured_roles[input.dataset.key.replace(/\s|&/g, "")] = { presenter: input.value.trim() };
  });
  const speakers = [];
  document.querySelectorAll("#speakersEditor .speech-card").forEach((card) => {
    const g = (k) => (card.querySelector(`input[data-key="${k}"]`)?.value || "").trim();
    const idx = parseInt(card.dataset.index, 10);
    const orig = lastParsedAgenda?.speakers?.[idx] || {};
    speakers.push({ ...orig,
      name: g("name"), title: g("title"), project: g("project"),
      project_description: g("project_description"), time: g("time"), evaluator: g("evaluator"),
    });
  });
  return { structured_roles, speakers };
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

async function updateForms(meetingData) {
  const urls = {
    feedback_form:     "https://script.google.com/macros/s/AKfycbwJvhdu3KwRkSW17tEFxodtYV5ssCn2Wvhtli1M_9N6KHDuz-mmchLFtW2LAdcHw6PNgQ/exec",
    speaker_form:      "https://script.google.com/macros/s/AKfycbxUu5xSp9PGSkmJp21XiR6Zh31s_C84S_RqpLunrrqWiGt-AXlg30VBcZz9Ka3SJxUsWw/exec",
    evaluator_form:    "https://script.google.com/macros/s/AKfycbzasaenEuAMB_11pQGr23lHVE_j_VSlhhgITDDReQd2MPQ9C0QfSChmX_5ZLlHoadyu/exec",
    table_topics_form: "https://script.google.com/macros/s/AKfycbye3kDgEZcBnyl-bK09cbmRmxFpueFdVi43gQv92EWP8wL1soKtq-B913_F_XhiJOZLAg/exec",
  };
  const norm = (n) => n ? n.replace(/\s+/g, " ").replace(/ ,/g, ",").trim() : "";
  const speakers = (meetingData.speakers || []).map(s => norm(s.name)).filter(n => n && n !== "TBA");
  // Filter icebreakers BEFORE mapping to names so project_description is still accessible
  const speakersNoIcebreakers = (meetingData.speakers || [])
    .filter(s => (s.project_description || "").toLowerCase() !== "icebreaker")
    .map(s => norm(s.name)).filter(n => n && n !== "TBA");
  const evaluators = (meetingData.speakers || []).map(s => norm(s.evaluator)).filter(n => n && n !== "TBA");
  const post = async (url, options) => {
    try { await fetch(url, { method: "POST", mode: "no-cors", body: JSON.stringify({ options }) }); }
    catch(e) { console.warn("Form update failed:", url, e); }
  };
  await Promise.all([
    post(urls.feedback_form,     [...new Set(speakers)]),
    post(urls.speaker_form,      [...new Set(speakersNoIcebreakers)]),
    post(urls.evaluator_form,    [...new Set(evaluators)]),
    post(urls.table_topics_form, ["No Winner 😈"]),
  ]);
}

// ─── Inject agenda JSON into the slides site's localStorage ──────────────
// Opens a hidden tab on the slides domain, writes the data, then closes it.
async function injectIntoSlidesLocalStorage(jsonString) {
  const escapedJson = JSON.stringify(jsonString); // double-stringify for safe injection into code string

  // Open the slides page in a background tab
  const tab = await browser.tabs.create({ url: SLIDES_URL, active: false });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error("Slides tab timed out loading"));
    }, 15000);

    function listener(tabId, changeInfo) {
      if (tabId !== tab.id || changeInfo.status !== "complete") return;
      browser.tabs.onUpdated.removeListener(listener);
      clearTimeout(timeout);

      browser.tabs.executeScript(tab.id, {
        code: `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${escapedJson});`
          .replace("STORAGE_KEY", JSON.stringify(STORAGE_KEY))
      })
      .then(() => {
        // Close the background tab now data is written
        browser.tabs.remove(tab.id);
        resolve();
      })
      .catch(err => {
        browser.tabs.remove(tab.id);
        reject(err);
      });
    }

    browser.tabs.onUpdated.addListener(listener);
  });
}

// ─── Open slides windows with operator instructions ───────────────────────
async function openSlidesWindows() {
  // Use browser.windows.create so Firefox doesn't block popups from extension pages
  await browser.windows.create({ url: SLIDES_URL,    type: "normal" });
  await browser.windows.create({ url: PRESENTER_URL, type: "normal" });

  // Replace current editor page with a friendly "done" instructions page
  showLaunchInstructions();
}

function showLaunchInstructions() {
  document.body.innerHTML = `
    <div style="
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f0f1a; color: #dde1ec; min-height: 100vh;
      display: flex; align-items: center; justify-content: center; padding: 32px;
    ">
      <div style="max-width: 520px; text-align: center;">
        <div style="font-size: 56px; margin-bottom: 16px;">✅</div>
        <h1 style="
          font-size: 22px; font-weight: 700; margin: 0 0 8px;
          background: linear-gradient(90deg, #6c63ff, #3ecf8e);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        ">Meeting slides are ready!</h1>
        <p style="color: #888; font-size: 14px; margin: 0 0 32px;">
          Two windows have been opened. Place them as follows:
        </p>

        <div style="display: grid; gap: 16px; text-align: left; margin-bottom: 32px;">
          <div style="
            background: rgba(108,99,255,0.12); border: 1px solid rgba(108,99,255,0.35);
            border-radius: 12px; padding: 18px;
          ">
            <div style="font-size: 22px; margin-bottom: 8px;">💻</div>
            <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">This window → Your laptop</div>
            <div style="font-size: 13px; color: #aaa; line-height: 1.5;">
              The <strong style="color:#9d97ff">Presenter View</strong> — shows your notes,
              next slide preview, and controls like Table Topics speaker entry.
              Keep this facing you.
            </div>
            <a href="${PRESENTER_URL}" target="_blank" style="
              display: inline-block; margin-top: 12px; font-size: 12px;
              color: #9d97ff; text-decoration: underline;
            ">Open Presenter View again →</a>
          </div>

          <div style="
            background: rgba(62,207,142,0.1); border: 1px solid rgba(62,207,142,0.3);
            border-radius: 12px; padding: 18px;
          ">
            <div style="font-size: 22px; margin-bottom: 8px;">📺</div>
            <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Other window → The big screen</div>
            <div style="font-size: 13px; color: #aaa; line-height: 1.5;">
              The <strong style="color:#3ecf8e">Audience View</strong> — full-screen slides
              for everyone to see. Drag this to the projector or external display,
              then press <kbd style="
                background: rgba(255,255,255,0.1); border-radius: 4px;
                padding: 1px 5px; font-family: monospace;
              ">F11</kbd> or <kbd style="
                background: rgba(255,255,255,0.1); border-radius: 4px;
                padding: 1px 5px; font-family: monospace;
              ">Ctrl+Shift+F</kbd> to go full screen.
            </div>
            <a href="${SLIDES_URL}" target="_blank" style="
              display: inline-block; margin-top: 12px; font-size: 12px;
              color: #3ecf8e; text-decoration: underline;
            ">Open Audience View again →</a>
          </div>
        </div>

        <p style="font-size: 12px; color: #555;">
          Both windows share the same agenda data — no file upload needed.
        </p>
      </div>
    </div>
  `;
}

function parseAndPopulate(html) {
  try {
    const agenda = scrapeEasySpeakAgenda(html);
    agenda.meeting_info.meeting_theme = "";
    agenda.structured_roles = getStructuredRoles(agenda);
    lastParsedAgenda = agenda;
    populateEditors(agenda);
    setStatus("success", "✅ Agenda loaded — review and save below.");
  } catch(err) {
    console.error(err);
    setStatus("error", "Parse failed: " + err.message);
  }
}

// ─── Init: load from extension storage ────────────────────────────────────
async function init() {
  try {
    const data = await browser.storage.local.get("pendingAgenda");
    if (data.pendingAgenda?.html) {
      await browser.storage.local.remove("pendingAgenda");
      document.getElementById("sourceBanner").style.display = "block";
      parseAndPopulate(data.pendingAgenda.html);
      return;
    }
  } catch(e) {
    console.log("Extension storage not available, using paste fallback.");
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────
document.getElementById("parseBtn").addEventListener("click", () => {
  const html = document.getElementById("htmlContent").value.trim();
  if (!html) { setStatus("error", "Please paste HTML first."); return; }
  parseAndPopulate(html);
});

document.getElementById("htmlContent").addEventListener("paste", () => {
  setTimeout(() => {
    const html = document.getElementById("htmlContent").value.trim();
    if (html) parseAndPopulate(html);
  }, 100);
});

document.getElementById("generateBtn").addEventListener("click", async () => {
  if (!lastParsedAgenda) { setStatus("error", "No agenda loaded yet."); return; }
  const btn = document.getElementById("generateBtn");
  btn.disabled = true;

  try {
    setStatus("info", "Saving and updating forms...");
    const edits = collectEdits();
    const final = { ...lastParsedAgenda };
    final.meeting_info.meeting_theme = document.getElementById("meetingTheme").value.trim() || "N/A";
    const wordOfDay = document.getElementById("wordOfDay").value.trim();
    if (wordOfDay) final.meeting_info.word_of_day = wordOfDay;
    final.structured_roles = edits.structured_roles;
    final.speakers = edits.speakers;

    // Write evaluator edits back into agenda_items
    if (Array.isArray(final.agenda_items)) {
      final.agenda_items.forEach((item) => {
        if ((item.role || "").toLowerCase().includes("evaluator")) {
          const m = (item.role || "").match(/^(\d+)/);
          const idx = m ? parseInt(m[1], 10) - 1 : -1;
          if (idx >= 0 && edits.speakers[idx]?.evaluator) {
            item.presenter = edits.speakers[idx].evaluator;
            final.structured_roles[(item.role || "").replace(/\s|&/g, "")] = { presenter: item.presenter };
          }
        }
      });
    }

    const jsonString = JSON.stringify(final);

    // 1. Download agenda.json as backup
    downloadJSON(final, "agenda.json");

    // 2. Update Google Forms
    setStatus("info", "Updating Google Forms...");
    await updateForms(final);

    // 3. Inject directly into the slides site's localStorage
    setStatus("info", "Injecting data into slides...");
    try {
      await injectIntoSlidesLocalStorage(jsonString);
    } catch(e) {
      // Non-fatal: data is still in the downloaded JSON
      console.warn("localStorage injection failed:", e);
      setStatus("info", "Could not auto-inject — use the downloaded agenda.json on the slides page.");
      await new Promise(r => setTimeout(r, 2000));
    }

    // 4. Open both windows and show instructions
    setStatus("success", "✅ Done! Opening slides...");
    await new Promise(r => setTimeout(r, 600));
    openSlidesWindows();

  } catch(err) {
    console.error(err);
    setStatus("error", "Failed: " + err.message);
    btn.disabled = false;
  }
});

init();
