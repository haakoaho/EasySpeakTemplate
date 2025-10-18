// --- Wait for the DOM to be fully loaded before running the script ---
document.addEventListener("DOMContentLoaded", () => {
  const generateBtn = document.getElementById("generateBtn");
  const parseBtn = document.getElementById("parseBtn");
  const htmlContentInput = document.getElementById("htmlContent");
  const meetingThemeInput = document.getElementById("meetingTheme");
  const statusDiv = document.getElementById("status");
  const editorContainer = document.getElementById("editorContainer");
  const rolesEditor = document.getElementById("rolesEditor");
  const speakersEditor = document.getElementById("speakersEditor");
  let lastParsedAgenda = null;

  // --- Attach event listener to the button ---
  // Parse button - populate the editable UI from pasted HTML
  parseBtn.addEventListener("click", () => {
    const htmlContent = htmlContentInput.value;
    if (!htmlContent.trim()) {
      updateStatus("error", "HTML content cannot be empty.");
      return;
    }
    try {
      updateStatus("info", "Parsing agenda... (edit below if needed)");
      const agendaObject = scrapeEasySpeakAgenda(htmlContent);
      lastParsedAgenda = agendaObject; // keep for merging later

      // Pre-fill meeting theme if user input exists
      agendaObject.meeting_info.meeting_theme =
        meetingThemeInput.value.trim() ||
        agendaObject.meeting_info.meeting_theme ||
        "N/A";
      agendaObject.structured_roles = getStructuredRoles(agendaObject);

      populateEditors(agendaObject);
      editorContainer.style.display = "block";
      updateStatus(
        "success",
        "Parsed agenda. Make edits then click Finalize."
      );
    } catch (err) {
      console.error(err);
      updateStatus("error", "Failed to parse HTML. See console for details.");
    }
  });

  // Generate button - collect edited data, ensure missing fields, then download and post
  generateBtn.addEventListener("click", async () => {
    try {
      if (!lastParsedAgenda) {
        updateStatus(
          "error",
          "No agenda has been parsed. Please paste HTML and click 'Parse Agenda' first."
        );
        return;
      }

      updateStatus("info", "Collecting edited data and generating JSON...");
      const edits = collectEditedAgenda();

      // Merge: preserve meeting_info and agenda_items from parsed, replace roles/speakers with edits
      const finalAgenda = { ...lastParsedAgenda };
      finalAgenda.meeting_info.meeting_theme =
        meetingThemeInput.value.trim() ||
        finalAgenda.meeting_info.meeting_theme ||
        "N/A";
      finalAgenda.structured_roles = edits.structured_roles;
      finalAgenda.speakers = edits.speakers; // Replace with the edited speakers

      console.log("Final merged agenda:", finalAgenda);

      downloadAgendaFile(finalAgenda, "agenda.json");
      updateStatus("info", "Updating Google Forms...");
      await updateForms(finalAgenda);
      updateStatus("success", "Generated agenda, forms updated, redirecting...");
    } catch (err) {
      console.error(err);
      updateStatus("error", `Generate failed: ${err.message}`);
    }
  });

  /**
   * Updates the status message on the page.
   */
  function updateStatus(type, message) {
    statusDiv.textContent = message;
    statusDiv.className = type; // 'success', 'error', or 'info'
  }

  /**
   * Triggers a client-side download of a JSON object as a file.
   */
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

  /**
   * Updates the Google Forms by sending POST requests.
   */
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

    const normalizeName = (name) =>
      name ? name.replace(/\s+/g, " ").replace(/ ,/g, ",").trim() : "";

    const speakers = (meetingData.speakers || [])
      .map((s) => normalizeName(s.name))
      .filter((name) => name && name !== "TBA");

    // NEW: Get evaluators from the speaker objects, which is more reliable
    const evaluators = (meetingData.speakers || [])
      .map((s) => normalizeName(s.evaluator))
      .filter((name) => name && name !== "TBA");

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

  // ----------------- NEW EDITOR LOGIC -----------------

  /**
   * A canonical list of all roles to display in the editor.
   */
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

  /**
   * Populates the editor UI with fields for all roles and speakers.
   */
  function populateEditors(agenda) {
    rolesEditor.innerHTML = "";
    speakersEditor.innerHTML = "";

    // --- 1. Populate Roles Editor ---
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

    // --- 2. Populate Speakers & Evaluators as grouped cards ---
    const speakersTitle = document.createElement("h3");
    speakersTitle.textContent = "Speeches";
    speakersEditor.appendChild(speakersTitle);

    // Link evaluators to speakers by their order
    const evaluators = agenda.agenda_items.filter((item) =>
      item.role.toLowerCase().includes("evaluator")
    );

    (agenda.speakers || []).forEach((speaker, index) => {
      const card = document.createElement("div");
      card.className = "speech-card";
      card.dataset.index = index;

      const cardTitle = document.createElement('h4');
      cardTitle.textContent = `Speech ${index + 1}`;
      card.appendChild(cardTitle);

      const speakerName = speaker.name || "";
      const speechTitle = speaker.title || "";
      // Find the corresponding evaluator by index (e.g., 1st Evaluator for 1st Speaker)
      const evaluator = evaluators.find((e) => e.role.startsWith(`${index + 1}`));
      const evaluatorName = evaluator ? evaluator.presenter : "";

      card.appendChild(createLabeledInput("Speaker", speakerName, "name"));
      card.appendChild(createLabeledInput("Speech Title", speechTitle, "title"));
      card.appendChild(createLabeledInput("Evaluator", evaluatorName, "evaluator"));
      speakersEditor.appendChild(card);
    });
  }

  /**
   * Creates a div containing a label and an input field.
   */
  function createLabeledInput(labelText, value, key) {
    const wrapper = document.createElement("div");
    wrapper.className = "field-row";
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "text";
    input.value = value || "";
    input.dataset.key = key; // Use a common key for data collection
    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return wrapper;
  }

  /**
   * Collects all data from the editable fields.
   */
  function collectEditedAgenda() {
    // Collect structured_roles from rolesEditor
    const structured_roles = {};
    rolesEditor.querySelectorAll(".field-row").forEach((row) => {
      const input = row.querySelector("input");
      const roleName = input.dataset.key;
      const presenterName = input.value.trim();
      const strippedKey = roleName.replace(/\s|&/g, "");
      if (roleName) {
        structured_roles[strippedKey] = { presenter: presenterName };
      }
    });

    // Collect speakers from speech cards
    const speakers = [];
    speakersEditor.querySelectorAll(".speech-card").forEach((card) => {
      const name = card.querySelector('input[data-key="name"]').value.trim();
      const title = card.querySelector('input[data-key="title"]').value.trim();
      const evaluator = card.querySelector('input[data-key="evaluator"]').value.trim();
      
      // Get original speaker data to preserve other fields
      const originalSpeakerIndex = card.dataset.index;
      const originalSpeaker = lastParsedAgenda.speakers[originalSpeakerIndex] || {};

      speakers.push({
        ...originalSpeaker, // Preserve fields like project, description, time
        name,
        title,
        evaluator, // Add the new evaluator field
      });
    });

    return {
      structured_roles,
      speakers,
    };
  }

  // ------------------------------------------------------------------
  // PREPROCESSING & SCRAPING LOGIC (Largely unchanged)
  // ------------------------------------------------------------------

  function getStructuredRoles(meetingData) {
    const rolesInfo = {};
    for (const item of meetingData.agenda_items) {
      if (
        !item.role ||
        item.role === "Break" ||
        !item.presenter ||
        item.presenter.toLowerCase() === "tba" ||
        item.role.includes("Speaker")
      )
        continue;

      const strippedRole = item.role.replace(/\s|&/g, "");
      rolesInfo[strippedRole] = {
        presenter: item.presenter,
      };
    }
    return rolesInfo;
  }

  function getDaySuffix(day) {
    if (day > 3 && day < 21) return "th";
    switch (day % 10) {
      case 1:
        return "st";
      case 2:
        return "nd";
      case 3:
        return "rd";
      default:
        return "th";
    }
  }

  function nextWeek(dateString) {
    const cleanedDateString = dateString.replace(/(st|nd|rd|th)/, "");
    const parsedDate = new Date(cleanedDateString);
    if (isNaN(parsedDate)) {
      console.warn("Could not parse the date string for nextWeek().");
      return "TBA";
    }
    parsedDate.setDate(parsedDate.getDate() + 7);
    const day = parsedDate.getDate();
    const suffix = getDaySuffix(day);
    const weekday = parsedDate.toLocaleDateString("en-GB", { weekday: "long" });
    const month = parsedDate.toLocaleDateString("en-GB", { month: "long" });
    const year = parsedDate.getFullYear();
    return `${weekday} ${day}${suffix} ${month} ${year}`;
  }

  function scrapeEasySpeakAgenda(htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");

    const meetingInfo = {};
    meetingInfo.club_name =
      doc.querySelector("a.maintitle")?.textContent.trim() ?? "";

    const districtInfoElem = Array.from(
      doc.querySelectorAll("span.gensmall")
    ).find((el) => el.textContent.includes("District"));
    if (districtInfoElem) {
      const parts = districtInfoElem.textContent.trim().split(", ");
      meetingInfo.district = parts[0]?.replace("District ", "") ?? "";
      meetingInfo.division = parts[1]?.replace("Division ", "") ?? "";
      meetingInfo.area = parts[2]?.replace("Area ", "") ?? "";
      meetingInfo.club_number = parts[3]?.replace("Club Number ", "") ?? "";
    }

    const postBodySpans = doc.querySelectorAll("span.postbody");
    for (const span of postBodySpans) {
      const text = span.textContent;
      const dateMatch = text.match(
        /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d+\w*\s+\w+\s+\d{4}/
      );
      if (dateMatch && !meetingInfo.meeting_date) {
        meetingInfo.meeting_date = dateMatch[0];
        meetingInfo.next_meeting_date = nextWeek(meetingInfo.meeting_date);
      }
      if (text.includes("Word of the Day")) {
        meetingInfo.word_of_the_day =
          text.split("Word of the Day")[1]?.trim() ?? "";
      }
      if (text.includes("Venue ")) {
        meetingInfo.venue = text.replace("Venue ", "").trim();
      }
    }

    meetingInfo.meeting_time =
      doc.querySelector("b")?.textContent.match(/\d{1,2}:\d{2}/)?.[0] ?? "";
    meetingInfo.schedule =
      Array.from(doc.querySelectorAll("span.gensmall"))
        .find((el) => el.textContent.includes("Every"))
        ?.textContent.trim() ?? "";

    const agenda_items = [];
    const speakers = [];
    const mainTable = doc.querySelector(
      'table[border="0"][cellpadding="1"][cellspacing="2"]'
    );
    if (mainTable) {
      const rows = mainTable.querySelectorAll("tr");
      for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll("td");
        if (cells.length < 5) continue;

        const time =
          cells[0].querySelector("span.gensmall")?.textContent.trim() ||
          (agenda_items.length > 0
            ? agenda_items[agenda_items.length - 1].time
            : "TBA");
        const role = cells[1].querySelector("span.gen")?.textContent.trim() ?? "";
        const presenter =
          cells[2].querySelector("span.gen")?.textContent.trim() ?? "";
        const event =
          cells[3].querySelector("span.gensmall")?.textContent.trim() ?? "";

        const durationParts =
          cells[4]
            .querySelector("span.gensmall")
            ?.textContent.trim()
            .split(/\s+/) ?? [];
        const duration_green = durationParts[0] ?? "";
        const duration_amber = durationParts[1] ?? "";
        const duration_red = durationParts[2] ?? "";

        agenda_items.push({
          time,
          role,
          presenter,
          event,
          duration_green,
          duration_amber,
          duration_red,
        });

        if (role.includes("Speaker")) {
          let project = "TBA";
          let description = "";
          const title = event;
          let speakerDetailRow = null;
          const potentialNextRows = Array.from(rows).slice(i + 1);

          for (const potentialRow of potentialNextRows) {
            const targetTd = potentialRow.querySelector(
              'td[colspan="3"][align="left"]'
            );
            if (targetTd) {
              speakerDetailRow = potentialRow;
              break;
            }
          }

          if (speakerDetailRow) {
            const projectDescTd = speakerDetailRow.querySelector(
              'td[colspan="3"][align="left"]'
            );
            if (projectDescTd) {
              const projectDescSpan = projectDescTd.querySelector(
                'span.gensmall[valign="top"]'
              );
              if (projectDescSpan) {
                const iTag = projectDescSpan.querySelector("i");
                if (iTag) {
                  const fullProjectLine = iTag.textContent.trim();
                  const projectParts = fullProjectLine.split(" - ");
                  project = projectParts[0].trim();
                  if (projectParts.length > 1) {
                    description = projectParts.slice(1).join(" - ").trim();
                  }
                }
              }
            }
          }

          speakers.push({
            position: role,
            name: presenter,
            project,
            title,
            description,
            time,
            duration_green,
            duration_amber,
            duration_red,
          });
        }
      }
    }

    // Attending members and next meeting logic remains the same
    const attending_members = [];
    const attendingHeader = Array.from(
      doc.querySelectorAll("span.cattitle")
    ).find((el) => el.textContent === "Attending");
    if (attendingHeader) {
      const membersCell = attendingHeader
        .closest("tr")
        ?.nextElementSibling?.querySelector("td.gensmall");
      if (membersCell) {
        attending_members.push(
          ...membersCell.textContent
            .split(/[,;\n\r]+/)
            .map((name) => name.trim())
            .filter((name) => name && name !== "Member")
        );
      }
    }

    const next_meeting =
      Array.from(doc.querySelectorAll("span.cattitle"))
        .find((el) => el.textContent === "Next Meeting")
        ?.nextElementSibling?.textContent.trim() ?? "";

    return {
      meeting_info: meetingInfo,
      agenda_items,
      speakers,
      attending_members,
      next_meeting,
    };
  }
});