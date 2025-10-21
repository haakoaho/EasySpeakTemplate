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
      finalAgenda.structured_roles = edits.structured_roles;
      finalAgenda.speakers = edits.speakers;

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

    const evaluators = agenda.agenda_items.filter((item) =>
      item.role.toLowerCase().includes("evaluator")
    );

    (agenda.speakers || []).forEach((speaker, index) => {
      const card = document.createElement("div");
      card.className = "speech-card";
      card.dataset.index = index;

      const cardTitle = document.createElement("h4");
      cardTitle.textContent = `Speech ${index + 1}`;
      card.appendChild(cardTitle);

      const evaluator = evaluators.find((e) =>
        e.role.startsWith(`${index + 1}`)
      );
      const evaluatorName = evaluator ? evaluator.presenter : "";

      card.appendChild(createLabeledInput("Speaker", speaker.name, "name"));
      card.appendChild(createLabeledInput("Speech Title", speaker.title, "title"));
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
      const name = card.querySelector('input[data-key="name"]').value.trim();
      const title = card.querySelector('input[data-key="title"]').value.trim();
      const evaluator = card.querySelector('input[data-key="evaluator"]').value.trim();
      const idx = card.dataset.index;
      const original = lastParsedAgenda.speakers[idx] || {};
      speakers.push({ ...original, name, title, evaluator });
    });

    return { structured_roles, speakers };
  }

  // --- Scraping and helper functions ---
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
      if (role.includes("Speaker")) {
        speakers.push({ name: presenter, title: event });
      }
      agenda_items.push({ role, presenter, event });
    });

    return { meeting_info: meetingInfo, agenda_items, speakers };
  }
});
