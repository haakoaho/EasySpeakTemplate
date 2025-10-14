// --- Wait for the DOM to be fully loaded before running the script ---
document.addEventListener("DOMContentLoaded", () => {
  const generateBtn = document.getElementById("generateBtn");
  const htmlContentInput = document.getElementById("htmlContent");
  const meetingThemeInput = document.getElementById("meetingTheme");
  const statusDiv = document.getElementById("status");

  // --- Attach event listener to the button ---
  generateBtn.addEventListener("click", async () => {
    const htmlContent = htmlContentInput.value;
    const meetingTheme = meetingThemeInput.value.trim();

    if (!htmlContent.trim()) {
      updateStatus("error", "HTML content cannot be empty.");
      return;
    }

    try {
      updateStatus("info", "Parsing agenda...");
      const agendaObject = scrapeEasySpeakAgenda(htmlContent);
      // Corrected typo from 'meething_theme' to 'meeting_theme'
      agendaObject.meeting_info.meeting_theme = meetingTheme || "N/A";

      // 🔥 NEW: PREPROCESS ROLES for easy sli.dev access
      agendaObject.structured_roles = getStructuredRoles(agendaObject);

      console.log("Scraped Data:", agendaObject); // For debugging

      // --- 1. DOWNLOAD JSON FILE TO CLIENT ---
      updateStatus("info", "Generating agenda.json for download...");

      // 🔥 MODIFIED: Replaced saveAgendaToDrive with downloadAgendaFile
      downloadAgendaFile(agendaObject, "agenda.json");

      // The download is a client-side action and does not return a promise
      // that needs to be awaited for network completion like a fetch call.
      // We'll proceed directly to the forms update.

      // --- 2. Update Google Forms ---
      updateStatus("info", "Updating Google Forms...");
      const formsPromise = updateForms(agendaObject);

      // --- Wait for Forms operation to complete ---
      await Promise.all([formsPromise]);

      updateStatus(
        "success",
        "Agenda downloaded and forms updated successfully! 🎉"
      );
    } catch (error) {
      console.error("An error occurred:", error);
      updateStatus("error", `An error occurred: ${error.message}`);
    }
  });

  /**
   * Updates the status message on the page.
   */
  function updateStatus(type, message) {
    statusDiv.textContent = message;
    statusDiv.className = type; // 'success', 'error', or 'info'
  }

  // --- NEW FUNCTION TO HANDLE CLIENT-SIDE DOWNLOAD ---

  /**
   * Triggers a client-side download of a JSON object as a file.
   */
  function downloadAgendaFile(data, filename) {
    // Convert the JSON object to a string with nice formatting (null, 2)
    const jsonString = JSON.stringify(data, null, 2);

    // Create a Blob from the string with the correct MIME type
    const blob = new Blob([jsonString], { type: "application/json" });

    // Create a temporary anchor element
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename; // Set the desired file name

    // Programmatically click the anchor to start the download
    document.body.appendChild(a);
    a.click();

    // Clean up by revoking the object URL and removing the element
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  // --- REMOVED: The saveAgendaToDrive function is no longer needed ---
  /*
    async function saveAgendaToDrive(endpointUrl, fileId, agendaData) {
        // ... (Original Google Drive code removed)
    }
    */

  // ------------------------------------------------------------------
  // RESTORED FORMS LOGIC
  // ------------------------------------------------------------------

  /**
   * Updates the Google Forms by sending POST requests.
   */
  async function updateForms(meetingData) {
    const urls = {
      // These URLs are for your Google Apps Scripts that handle form dropdown updates
      feedback_form:
        "https://script.google.com/macros/s/AKfycbwJvhdu3KwRkSW17tEFxodtYV5ssCn2Wvhtli1M_9N6KHDuz-mmchLFtW2LAdcHw6PNgQ/exec",
      speaker_form:
        "https://script.google.com/macros/s/AKfycbxUu5xSp9PGSkmJp21XiR6Zh31s_C84S_RqpLunrrqWiGt-AXlg30VBcZz9Ka3SJxUsWw/exec",
      evaluator_form:
        "https://script.google.com/macros/s/AKfycbzasaenEuAMB_11pQGr23lHVE_j_VSlhhgITDDReQd2MPQ9C0QfSChmX_5ZLlHoadyu/exec",
      table_topics_form:
        "https://script.google.com/macros/s/AKfycbye3kDgEZcBnyl-bK09cbmRmxFpueFdVi43gQv92EWP8wL1soKtq-B913_F_XhiJOZLAg/exec",
    };

    const speakers = meetingData.speakers
      .map((s) => s.name)
      .filter((name) => name && name !== "TBA");

    const evaluators = meetingData.agenda_items
      .filter(
        (item) =>
          (item.event.includes("Evaluate speech") ||
            item.event.includes("Table Topics Evaluator")) &&
          item.presenter &&
          item.presenter !== "TBA"
      )
      .map((item) => item.presenter);

    // 🔥 NEW CHANGE: Combine speakers and evaluators into one list, removing duplicates
    const speakerAndEvaluatorList = [...new Set([...speakers, ...evaluators])];

    // Function to send data to a Google Form Web App
    const postData = async (url, options) => {
      try {
        await fetch(url, {
          method: "POST",
          mode: "no-cors", // Use 'no-cors' for Google App Script Web Apps
          // Pass the array of options (speakers/evaluators)
          body: JSON.stringify({ options: options }),
        });
      } catch (e) {
        console.warn(
          `Could not update form at ${url}. This might be expected due to 'no-cors' mode, but check for network errors:`,
          e
        );
      }
    };

    await Promise.all([
      // Use the combined list for feedback and speaker forms
      postData(urls.feedback_form, speakers),
      postData(urls.speaker_form, speakers),
      postData(urls.evaluator_form, evaluators),
      postData(urls.table_topics_form, ["None"]),
    ]);

    // ✅ After all form updates are done, wait a bit and then redirect
    setTimeout(() => {
      window.location.href =
        "https://haakoaho.github.io/Oslo-Toastmaters-Meeting/1";
    }, 1500); // small delay so user sees the “success” message
  }

  // ------------------------------------------------------------------
  // NEW: PREPROCESSING LOGIC FOR SLI.DEV TEMPLATES
  // ------------------------------------------------------------------

  /**
   * Extracts essential roles and their presenters/times into a structured object.
   * This is optimized for sli.dev template consumption.
   */
  function getStructuredRoles(meetingData) {
    const rolesInfo = {};
    for (const item of meetingData.agenda_items) {
      // Skip if role or presenter is missing, is a break, or is TBA
      if (
        !item.role ||
        item.role === "Break" ||
        !item.presenter ||
        item.presenter.toLowerCase() === "tba"
      )
        continue;

      if (item.role.includes("Speaker")) {
        continue;
      }
      const strippedRole = item.role.replace(/\s/g, "");
      rolesInfo[strippedRole] = {
        presenter: item.presenter,
      };
    }
    return rolesInfo;
  }

  // ------------------------------------------------------------------
  // REST OF ORIGINAL SCRAPING LOGIC
  // ------------------------------------------------------------------

  /**
   * Helper to get the correct suffix for a day of the month (1st, 2nd, 3rd, 4th).
   */
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

  /**
   * Calculates the date exactly 7 days in the future.
   */
  function nextWeek(dateString) {
    // Remove ordinal suffix (st, nd, rd, th) to allow parsing
    const cleanedDateString = dateString.replace(/(st|nd|rd|th)/, "");
    const parsedDate = new Date(cleanedDateString);

    if (isNaN(parsedDate)) {
      throw new Error("Could not parse the date string. Check the format.");
    }

    // Add 7 days
    parsedDate.setDate(parsedDate.getDate() + 7);

    const day = parsedDate.getDate();
    const suffix = getDaySuffix(day);
    const weekday = parsedDate.toLocaleDateString("en-GB", { weekday: "long" });
    const month = parsedDate.toLocaleDateString("en-GB", { month: "long" });
    const year = parsedDate.getFullYear();

    return `${weekday} ${day}${suffix} ${month} ${year}`;
  }

  /**
   * Scrapes the HTML content of an EasySpeak agenda page.
   */
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
        const role =
          cells[1].querySelector("span.gen")?.textContent.trim() ?? "";
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

          // Look through all subsequent rows to find the detail row
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

                  const descLines = [];
                  if (projectParts.length > 1) {
                    descLines.push(projectParts.slice(1).join(" - ").trim());
                  }

                  description = descLines
                    .filter((line) => line)
                    .join(" ")
                    .trim();
                } else {
                  const allStringsInSpan = Array.from(
                    projectDescSpan.childNodes
                  )
                    .map((node) =>
                      node.textContent ? node.textContent.trim() : ""
                    )
                    .filter((s) => s);

                  if (allStringsInSpan.length > 0) {
                    project = "N/A (No Pathways Info)";
                    description = allStringsInSpan.join(" ").trim();
                  } else {
                    project = "N/A (No Pathways Info)";
                    description = "";
                  }
                }
              } else {
                project = "TBA";
                description = "";
              }
            } else {
              project = "TBA";
              description = "";
            }
          } else {
            // No valid speaker_detail_row found at all
            project = "TBA";
            description = "";
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
