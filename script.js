document.addEventListener("DOMContentLoaded", () => {
  const generateBtn = document.getElementById("generateBtn");
  const htmlContentInput = document.getElementById("htmlContent");
  const meetingThemeInput = document.getElementById("meetingTheme");
  const statusDiv = document.getElementById("status");
  const editorContainer = document.getElementById("editorContainer");
  const rolesEditor = document.getElementById("rolesEditor");
  const speakersEditor = document.getElementById("speakersEditor");
  let lastParsedAgenda = null;
  let hasParsed = false;

  // --- Auto-parse when HTML is pasted ---
  htmlContentInput.addEventListener("paste", () => {
    setTimeout(() => {
      const htmlContent = htmlContentInput.value.trim();
      if (!htmlContent) {
        updateStatus("error", "HTML content cannot be empty.");
        return;
      }

      try {
        updateStatus("info", "Parsing agenda... (edit below if needed)");
        const agendaObject = scrapeEasySpeakAgenda(htmlContent);
        lastParsedAgenda = agendaObject;
        hasParsed = true;

        // Fill meeting theme if blank
        agendaObject.meeting_info.meeting_theme =
          meetingThemeInput.value.trim() ||
          agendaObject.meeting_info.meeting_theme ||
          "N/A";
        agendaObject.structured_roles = getStructuredRoles(agendaObject);

        populateEditors(agendaObject);
        editorContainer.style.display = "block";
        updateStatus("success", "Agenda parsed! Edit and click Save below.");
      } catch (err) {
        console.error(err);
        updateStatus("error", "Failed to parse HTML. See console for details.");
      }
    }, 100);
  });

  // --- Save/Generate button logic ---
  generateBtn.addEventListener("click", async () => {
    try {
      if (!hasParsed) {
        updateStatus("error", "Please paste HTML first.");
        return;
      }

      updateStatus("info", "Collecting edits and generating JSON...");
      const edits = collectEditedAgenda();
      const finalAgenda = { ...lastParsedAgenda };

      finalAgenda.meeting_info.meeting_theme =
        meetingThemeInput.value.trim() ||
        finalAgenda.meeting_info.meeting_theme ||
        "N/A";
      // Word of the Day field (optional)
      const wordOfDayInput = document.getElementById("wordOfDay");
      if (wordOfDayInput) {
        finalAgenda.meeting_info.word_of_day = wordOfDayInput.value.trim();
      }

      finalAgenda.structured_roles = edits.structured_roles;
      finalAgenda.speakers = edits.speakers;

      // Ensure evaluator edits are written back into agenda_items and structured_roles
      if (Array.isArray(finalAgenda.agenda_items)) {
        finalAgenda.agenda_items.forEach((item, ai) => {
          if ((item.role || "").toLowerCase().includes("evaluator")) {
            // try to parse leading number to map to speaker index
            const m = (item.role || "").match(/^(\d+)/);
            const idx = m ? parseInt(m[1], 10) - 1 : -1;
            if (idx >= 0 && edits.speakers[idx] && edits.speakers[idx].evaluator) {
              item.presenter = edits.speakers[idx].evaluator;
              // also update structured_roles entry for this role key
              const key = (item.role || "").replace(/\s|&/g, "");
              finalAgenda.structured_roles[key] = { presenter: item.presenter };
            }
          }
        });
      }

      downloadAgendaFile(finalAgenda, "agenda.json");
      await updateForms(finalAgenda);
      updateStatus("success", "Agenda saved, forms updated, redirecting...");
    } catch (err) {
      console.error(err);
      updateStatus("error", `Generate failed: ${err.message}`);
    }
  });

  // --- UI Helpers ---
  function updateStatus(type, message) {
    statusDiv.textContent = message;
    statusDiv.className = type;
  }

  function downloadAgendaFile(data, filename) {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  async function updateForms(meetingData) {
    const urls = {
      feedback_form:
        "https://script.google.com/macros/s/AKfycbwJvhdu3KwRkSW17tEFxodtYV5ssCn2Wvhtli1M_9N6KHDuz-mmchLFtW2LAdcHw6PNgQ/exec",
      speaker_form:
        "https://script.google.com/macros/s/AKfycbxUu5xSp9PGSkmJp21XiR6Zh31s_C84S_RqpLunrrqWiGt-AXlg30VBcZz9Ka3SJxUsWw/exec",
      evaluator_form:
        "https://script.google.com/macros/s/AKfycbzasaenEuAMB_11pQGr23lHVE_j_VSlhhgITDDReQd2MPQ9C0QfSChmX_5ZLlHoadyu/exec",
      table_topics_form:
        "https://script.google.com/macros/s/AKfycbye3kDgEZcBnyl-bK09cbmRmxFpueFdVi43gQv92EWP8wL1soKtq-B913_F_XhiJOZLAg/exec",
    };

    const normalize = (name) =>
      name ? name.replace(/\s+/g, " ").replace(/ ,/g, ",").trim() : "";

    const speakers = (meetingData.speakers || [])
      .map((s) => normalize(s.name))
      .filter((n) => n && n !== "TBA");

    const evaluators = (meetingData.speakers || [])
      .map((s) => normalize(s.evaluator))
      .filter((n) => n && n !== "TBA");

    const speakerList = [...new Set(speakers)];
    const evaluatorList = [...new Set(evaluators)];
    const tableTopicsList = ["No Winner 😈"];

    const postData = async (url, options) => {
      try {
        await fetch(url, {
          method: "POST",
          mode: "no-cors",
          body: JSON.stringify({ options }),
        });
      } catch (e) {
        console.warn(`Could not update form at ${url}:`, e);
      }
    };

    await Promise.all([
      postData(urls.feedback_form, speakerList),
      postData(urls.speaker_form, speakerList),
      postData(urls.evaluator_form, evaluatorList),
      postData(urls.table_topics_form, tableTopicsList),
    ]);

    setTimeout(() => {
      window.location.href =
        "https://haakoaho.github.io/Oslo-Toastmaters-Meeting/1";
    }, 1500);
  }

  // --- Roles and Speakers Editor ---
  const ALL_ROLES = [
    "President",
    "Toastmaster",
    "General Evaluator",
    "Table Topic Master",
    "Timer",
    "Grammarian & Word of the Day",
    "Ah & Vote Counter",
    "Table Topics Evaluator",
  ];

  function populateEditors(agenda) {
    rolesEditor.innerHTML = "";
    speakersEditor.innerHTML = "";

    // Roles
    const rolesTitle = document.createElement("h3");
    rolesTitle.textContent = "Meeting Roles";
    rolesEditor.appendChild(rolesTitle);

    const parsedRoles = agenda.structured_roles || {};
    ALL_ROLES.forEach((roleName) => {
      const strippedKey = roleName.replace(/\s|&/g, "");
      const presenter = parsedRoles[strippedKey]?.presenter || "";
      const row = createLabeledInput(roleName, presenter, roleName);
      rolesEditor.appendChild(row);
    });

    // Speakers
    const speakersTitle = document.createElement("h3");
    speakersTitle.textContent = "Speeches";
    speakersEditor.appendChild(speakersTitle);

    // Build a map from speaker index -> evaluator agenda item (if present)
    const evaluatorItemMap = {};
    agenda.agenda_items.forEach((item, ai) => {
      if ((item.role || "").toLowerCase().includes("evaluator")) {
        const m = (item.role || "").match(/^(\d+)/);
        const idx = m ? parseInt(m[1], 10) - 1 : -1;
        evaluatorItemMap[idx] = { presenter: item.presenter, aiIndex: ai, role: item.role };
      }
    });

    (agenda.speakers || []).forEach((speaker, index) => {
      const card = document.createElement("div");
      card.className = "speech-card";
      card.dataset.index = index;

      const cardTitle = document.createElement("h4");
      cardTitle.textContent = `Speech ${index + 1}`;
      card.appendChild(cardTitle);

      const evaluatorName = evaluatorItemMap[index]?.presenter || "";

      card.appendChild(createLabeledInput("Speaker", speaker.name, "name"));
      card.appendChild(createLabeledInput("Speech Title", speaker.title, "title"));
  card.appendChild(createLabeledInput("Project", speaker.project || "", "project"));
  card.appendChild(createLabeledInput("Project Description", speaker.project_description || "", "project_description"));
      card.appendChild(createLabeledInput("Time", speaker.time || "", "time"));
      card.appendChild(createLabeledInput("Evaluator", evaluatorName, "evaluator"));
      speakersEditor.appendChild(card);
    });

    // Add Speaker button
    const addSpeakerBtn = document.createElement("button");
    addSpeakerBtn.textContent = "+ Add Speaker";
    addSpeakerBtn.type = "button";
    addSpeakerBtn.id = "addSpeakerBtn";
    addSpeakerBtn.style.marginTop = "1em";

    addSpeakerBtn.addEventListener("click", () => {
      const index = speakersEditor.querySelectorAll(".speech-card").length;
      const card = document.createElement("div");
      card.className = "speech-card";
      card.dataset.index = index;

      const cardTitle = document.createElement("h4");
      cardTitle.textContent = `Speech ${index + 1}`;
      card.appendChild(cardTitle);

      card.appendChild(createLabeledInput("Speaker", "", "name"));
      card.appendChild(createLabeledInput("Speech Title", "", "title"));
      card.appendChild(createLabeledInput("Evaluator", "", "evaluator"));
      speakersEditor.appendChild(card);
    });

    speakersEditor.appendChild(addSpeakerBtn);
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

  function collectEditedAgenda() {
    const structured_roles = {};
    rolesEditor.querySelectorAll(".field-row").forEach((row) => {
      const input = row.querySelector("input");
      const roleName = input.dataset.key;
      const presenter = input.value.trim();
      const strippedKey = roleName.replace(/\s|&/g, "");
      structured_roles[strippedKey] = { presenter };
    });

    const speakers = [];
    speakersEditor.querySelectorAll(".speech-card").forEach((card) => {
      const name = (card.querySelector('input[data-key="name"]')?.value || "").trim();
      const title = (card.querySelector('input[data-key="title"]')?.value || "").trim();
  const project = (card.querySelector('input[data-key="project"]')?.value || "").trim();
  const project_description = (card.querySelector('input[data-key="project_description"]')?.value || "").trim();
  const time = (card.querySelector('input[data-key="time"]')?.value || "").trim();
      const evaluator = (card.querySelector('input[data-key="evaluator"]')?.value || "").trim();
      const idx = parseInt(card.dataset.index, 10);
      const original = (lastParsedAgenda && lastParsedAgenda.speakers && lastParsedAgenda.speakers[idx]) || {};
      speakers.push({ ...original, name, title, project, project_description, time, evaluator });
    });

    return { structured_roles, speakers };
  }

  // --- Scraping and helper functions ---
  function extractTime(text) {
    if (!text) return "";
    // Try several patterns in order: range with colon, range without colon, single time with colon, minutes
    const patterns = [
      /(\d{1,2}:\d{2})\s*(?:to|\-|–|—)\s*(\d{1,2}:\d{2})/i, // 5:00 to 7:00 or 5:00-7:00
      /(\d{1,2})\s*(?:to|\-|–|—)\s*(\d{1,2})\s*min/i, // 5-7 min
      /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i, // 6:00 or 6:00 PM
      /(\d{1,2})\s*min/i, // 5 min
      /(\d{1,2}:\d{2})/i,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m) {
        // return the matched portion (join groups if range)
        if (m[2]) return (m[1] + (m[2] ? ' to ' + m[2] : '')).trim();
        return m[1].trim();
      }
    }
    return "";
  }
  
  function findTimeInRow(row) {
    if (!row) return "";
    // Prefer time data inside a td that contains a nested table (common structure),
    // or otherwise a td after the title column. This avoids capturing the agenda slot
    // time (first td, e.g. '18:24').
    const tds = Array.from(row.querySelectorAll('td'));
    const timeRegex = /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?|\d{1,2}\s*min)/g;

    // 1) look for a td that contains a nested table
    for (const td of tds) {
      if (td.querySelector('table')) {
        const found = collectTimesFromElement(td, timeRegex);
        if (found.length >= 2) return `${found[0]} to ${found[found.length - 1]}`;
        if (found.length === 1) return found[0];
      }
    }

    // 2) look for td after the presenter/title columns (skip the first td which is slot time)
    for (let i = 1; i < tds.length; i++) {
      const td = tds[i];
      const found = collectTimesFromElement(td, timeRegex);
      if (found.length >= 2) return `${found[0]} to ${found[found.length - 1]}`;
      if (found.length === 1) return found[0];
    }

    // 3) fallback: scan the whole row but ignore the first td's text to avoid the slot time
    const rowText = tds.slice(1).map(td => td.textContent || '').join(' ');
    return extractTime(rowText || row.textContent || '');
  }

  function collectTimesFromElement(el, timeRegex) {
    const found = [];
    const candidates = Array.from(el.querySelectorAll('span, td'));
    for (const c of candidates) {
      const text = (c.textContent || '').trim();
      if (!text) continue;
      let m;
      // reset lastIndex for global regex reuse
      timeRegex.lastIndex = 0;
      while ((m = timeRegex.exec(text)) !== null) {
        found.push(m[0].trim());
      }
    }
    return found;
  }
  function getStructuredRoles(meetingData) {
    const roles = {};
    for (const item of meetingData.agenda_items) {
      if (
        !item.role ||
        item.role === "Break" ||
        !item.presenter ||
        item.presenter.toLowerCase() === "tba" ||
        item.role.includes("Speaker")
      )
        continue;

      const key = item.role.replace(/\s|&/g, "");
      roles[key] = { presenter: item.presenter };
    }
    return roles;
  }

  function scrapeEasySpeakAgenda(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const meetingInfo = {};
    meetingInfo.club_name =
      doc.querySelector("a.maintitle")?.textContent.trim() ?? "";

    const agenda_items = [];
    const speakers = [];
    const rows = doc.querySelectorAll("table tr");
    rows.forEach((r) => {
      const tds = r.querySelectorAll("td");
      if (tds.length < 5) return;
      const role = tds[1]?.innerText.trim() || "";
      const presenter = tds[2]?.innerText.trim() || "";
      const event = tds[3]?.innerText.trim() || "";

      // If speaker row, try to capture an immediate detail row (project/time).
      // Prefer an <i> element inside the row as the pathway/project title. If not present,
      // fall back to the next detail row heuristics.
      if (role.includes("Speaker")) {
        let project = "";
        let time = "";

        // Prefer emphasized content inside the current row (i, em, strong) as the Pathways title
        const italic = r.querySelector("i, em, strong, b");
        if (italic && italic.textContent && italic.textContent.trim()) {
          project = italic.textContent.trim();
        } else {
          // fallback to looking at an immediate detail sibling row
          const next = r.nextElementSibling;
          if (next) {
            const nextTds = next.querySelectorAll("td");
            if (nextTds.length <= 2 || nextTds.length < 5) {
              // Use innerHTML and split on <br> to avoid concatenating lines when innerText joins them
              const html = next.innerHTML || "";
              const firstPartHtml = html.split(/<br\s*\/?/i)[0] || html;
              // create a temporary element to strip HTML tags safely
              const tmp = document.createElement('div');
              tmp.innerHTML = firstPartHtml;
              const candidate = (tmp.textContent || tmp.innerText || '').trim();
              if (candidate) {
                // cut before common description starters to avoid long descriptions
                const descStarters = ["Deliver", "Demonstrate", "Demonstrates", "Provides", "Learn", "Learners", "Participants", "This project", "By the end", "Tell", "Use", "Explain", "Discuss"];
                let cutCandidate = candidate;
                for (const starter of descStarters) {
                  const idx = cutCandidate.indexOf(starter);
                  if (idx > 10) {
                    cutCandidate = cutCandidate.slice(0, idx).trim();
                    break;
                  }
                }
                project = cutCandidate;
              }
            }
          }
        }
        // If project contains a dash, split into short project title and description
        let project_description = "";
        if (project) {
          const splitRe = /\s[-–—]\s/;
          if (splitRe.test(project)) {
            const parts = project.split(splitRe);
            project = (parts[0] || "").trim();
            project_description = (parts.slice(1).join(' - ') || "").trim();
          } else if (project.includes(' - ') || project.includes('-')) {
            // fallback: split on first hyphen
            const idx = project.indexOf('-');
            if (idx > 0) {
              project_description = project.slice(idx + 1).trim();
              project = project.slice(0, idx).trim();
            }
          }
        }

        // Prefer to find time within the same row (nested spans/tables) before using detail text
        time = findTimeInRow(r) || extractTime((event || "") + " " + (project || "") + " " + (project_description || ""));

        speakers.push({ name: presenter, title: event, project, project_description, time });
      }
      agenda_items.push({ role, presenter, event });
    });

    return { meeting_info: meetingInfo, agenda_items, speakers };
  }
});
