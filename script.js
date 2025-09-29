// --- Wait for the DOM to be fully loaded before running the script ---
document.addEventListener('DOMContentLoaded', () => {

    const generateBtn = document.getElementById('generateBtn');
    const htmlContentInput = document.getElementById('htmlContent');
    const meetingThemeInput = document.getElementById('meetingTheme');
    const statusDiv = document.getElementById('status');

    // --- Attach event listener to the button ---
    generateBtn.addEventListener('click', async () => {
        const htmlContent = htmlContentInput.value;
        const meetingTheme = meetingThemeInput.value.trim();

        if (!htmlContent.trim()) {
            updateStatus('error', 'HTML content cannot be empty.');
            return;
        }

        try {
            updateStatus('info', 'Parsing agenda...');
            const agendaObject = scrapeEasySpeakAgenda(htmlContent);
            agendaObject.meeting_info.meething_theme = meetingTheme || "N/A";
            
            console.log("Scraped Data:", agendaObject); // For debugging

            updateStatus('info', 'Generating presentation...');
            await updatePptxPresentation('public/template.pptx', 'presentation.pptx', agendaObject);
            
            updateStatus('info', 'Updating Google Forms...');
            await updateForms(agendaObject);

            updateStatus('success', 'Presentation downloaded and forms updated successfully!');
        } catch (error) {
            console.error('An error occurred:', error);
            updateStatus('error', `An error occurred: ${error.message}`);
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
     * Helper to get the correct suffix for a day of the month (1st, 2nd, 3rd, 4th).
     */
    function getDaySuffix(day) {
        if (day > 3 && day < 21) return 'th';
        switch (day % 10) {
            case 1: return "st";
            case 2: return "nd";
            case 3: return "rd";
            default: return "th";
        }
    }

    /**
     * Calculates the date exactly 7 days in the future.
     * @param {string} dateString - e.g., "Tuesday 2nd September 2025"
     * @returns {string} - The new date string.
     */
    function nextWeek(dateString) {
        // Remove ordinal suffix (st, nd, rd, th) to allow parsing
        const cleanedDateString = dateString.replace(/(st|nd|rd|th)/, '');
        const parsedDate = new Date(cleanedDateString);

        if (isNaN(parsedDate)) {
            throw new Error("Could not parse the date string. Check the format.");
        }

        // Add 7 days
        parsedDate.setDate(parsedDate.getDate() + 7);
        
        const day = parsedDate.getDate();
        const suffix = getDaySuffix(day);
        const weekday = parsedDate.toLocaleDateString('en-GB', { weekday: 'long' });
        const month = parsedDate.toLocaleDateString('en-GB', { month: 'long' });
        const year = parsedDate.getFullYear();

        return `${weekday} ${day}${suffix} ${month} ${year}`;
    }

    /**
     * Scrapes the HTML content of an EasySpeak agenda page.
     * Replicates the Python BeautifulSoup logic using the DOMParser API.
     */
    function scrapeEasySpeakAgenda(htmlContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');

        const meetingInfo = {};
        meetingInfo.club_name = doc.querySelector('a.maintitle')?.textContent.trim() ?? "";
        
        const districtInfoElem = Array.from(doc.querySelectorAll('span.gensmall')).find(el => el.textContent.includes('District'));
        if (districtInfoElem) {
            const parts = districtInfoElem.textContent.trim().split(', ');
            meetingInfo.district = parts[0]?.replace('District ', '') ?? "";
            meetingInfo.division = parts[1]?.replace('Division ', '') ?? "";
            meetingInfo.area = parts[2]?.replace('Area ', '') ?? "";
            meetingInfo.club_number = parts[3]?.replace('Club Number ', '') ?? "";
        }

        const postBodySpans = doc.querySelectorAll('span.postbody');
        for (const span of postBodySpans) {
            const text = span.textContent;
            const dateMatch = text.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d+\w*\s+\w+\s+\d{4}/);
            if (dateMatch && !meetingInfo.meeting_date) {
                meetingInfo.meeting_date = dateMatch[0];
                meetingInfo.next_meeting_date = nextWeek(meetingInfo.meeting_date);
            }
            if (text.includes('Word of the Day')) {
                meetingInfo.word_of_the_day = text.split('Word of the Day')[1]?.trim() ?? "";
            }
            if (text.includes('Venue ')) {
                 meetingInfo.venue = text.replace('Venue ', '').trim();
            }
        }
        
        meetingInfo.meeting_time = doc.querySelector('b')?.textContent.match(/\d{1,2}:\d{2}/)?.[0] ?? "";
        meetingInfo.schedule = Array.from(doc.querySelectorAll('span.gensmall')).find(el => el.textContent.includes('Every'))?.textContent.trim() ?? "";

        const agenda_items = [];
        const speakers = [];
        const mainTable = doc.querySelector('table[border="0"][cellpadding="1"][cellspacing="2"]');
        if (mainTable) {
            const rows = mainTable.querySelectorAll('tr');
            for (let i = 0; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll('td');
                if (cells.length < 5) continue;

                const time = cells[0].querySelector('span.gensmall')?.textContent.trim() || (agenda_items.length > 0 ? agenda_items[agenda_items.length - 1].time : "TBA");
                const role = cells[1].querySelector('span.gen')?.textContent.trim() ?? "";
                const presenter = cells[2].querySelector('span.gen')?.textContent.trim() ?? "";
                const event = cells[3].querySelector('span.gensmall')?.textContent.trim() ?? "";
                
                const durationParts = cells[4].querySelector('span.gensmall')?.textContent.trim().split(/\s+/) ?? [];
                const duration_green = durationParts[0] ?? "";
                const duration_amber = durationParts[1] ?? "";
                const duration_red = durationParts[2] ?? "";
                
                agenda_items.push({ time, role, presenter, event, duration_green, duration_amber, duration_red });

                if (role.includes("Speaker")) {
                    let project = "TBA";
                    let description = "";
                    const title = event;
                    
                    let speakerDetailRow = null;
                    
                    // Look through all subsequent rows to find the detail row
                    // The detail row should contain a <td> with colspan="3" AND align="left"
                    const potentialNextRows = Array.from(rows).slice(i + 1);
                    
                    for (const potentialRow of potentialNextRows) {
                        const targetTd = potentialRow.querySelector('td[colspan="3"][align="left"]');
                        if (targetTd) {
                            speakerDetailRow = potentialRow;
                            break;
                        }
                    }
                    
                    if (speakerDetailRow) {
                        // The project/description is in the <td> with colspan="3" and align="left"
                        const projectDescTd = speakerDetailRow.querySelector('td[colspan="3"][align="left"]');
                        
                        if (projectDescTd) {
                            // Find the span directly within this td
                            const projectDescSpan = projectDescTd.querySelector('span.gensmall[valign="top"]');
                            
                            if (projectDescSpan) {
                                // The project line itself is inside an <i> tag (e.g., Pathways project)
                                const iTag = projectDescSpan.querySelector('i');
                                
                                if (iTag) {
                                    const fullProjectLine = iTag.textContent.trim();
                                    
                                    // The 'project' is the part before ' - ' in the i_tag (if applicable)
                                    // The 'description' is the rest of the text in the span, after the i_tag.
                                    const projectParts = fullProjectLine.split(' - ');
                                    project = projectParts[0].trim();
                                    
                                    // The description includes all subsequent text nodes within the span
                                    const descLines = [];
                                    // Add the part after ' - ' from the i_tag to the description if it's there
                                    if (projectParts.length > 1) {
                                        // This is usually the specific title from the Pathways manual for the speech type
                                        // or a short description of the Pathways objective.
                                        descLines.push(projectParts.slice(1).join(' - ').trim());
                                    }
                                    
                                    // Combine all description parts, filtering out empty strings
                                    description = descLines.filter(line => line).join(" ").trim();
                                    
                                } else {
                                    // If no <i> tag is found within the span (e.g., a custom speech not tied to Pathways)
                                    const allStringsInSpan = Array.from(projectDescSpan.childNodes)
                                        .map(node => node.textContent ? node.textContent.trim() : '')
                                        .filter(s => s);
                                    
                                    if (allStringsInSpan.length > 0) {
                                        project = "N/A (No Pathways Info)"; // Indicate no Pathways info
                                        description = allStringsInSpan.join(" ").trim(); // All text in span is description
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
                        duration_red 
                    });
                }
            }
        }
        
        const attending_members = [];
        const attendingHeader = Array.from(doc.querySelectorAll('span.cattitle')).find(el => el.textContent === 'Attending');
        if (attendingHeader) {
            const membersCell = attendingHeader.closest('tr')?.nextElementSibling?.querySelector('td.gensmall');
            if (membersCell) {
                attending_members.push(...membersCell.textContent.split(/[,;\n\r]+/).map(name => name.trim()).filter(name => name && name !== "Member"));
            }
        }

        const next_meeting = Array.from(doc.querySelectorAll('span.cattitle')).find(el => el.textContent === 'Next Meeting')?.nextElementSibling?.textContent.trim() ?? "";

        return { meeting_info: meetingInfo, agenda_items, speakers, attending_members, next_meeting };
    }

    /**
     * Extracts roles and presenters into a structured object.
     */
    function getRolesAndPresenters(meetingData) {
        const rolesInfo = {};
        for (const item of meetingData.agenda_items) {
            if (!item.role || item.role === 'Break') continue;
            const sanitizedRole = item.role.replace(/[^a-zA-Z0-9]/g, '');
            rolesInfo[sanitizedRole] = {
                presenter: item.presenter || "N/A",
                min_time: item.duration_green || "N/A",
                max_time: item.duration_red || "N/A"
            };
        }
        return rolesInfo;
    }

    /**
     * Updates the Google Forms by sending POST requests.
     */
    async function updateForms(meetingData) {
        const urls = {
            feedback_form: "https://script.google.com/macros/s/AKfycbz7CpmaWJ3K0A3JQydu9F2z-h1lPNwkh7OeGl-ia5stQ-XJY6i7CwtOS6Sv9959e-jJ/exec",
            speaker_form: "https://script.google.com/macros/s/AKfycbxcFD8uWhxh0wg6ZXkGU7ZmqUpCTtzTklkcV6h1JamJ0gSX--z7jvk6WtfPdTGElM1E/exec",
            evaluator_form: "https://script.google.com/macros/s/AKfycbydCQEm60REI0gy7SC1g4rpQU3hlOwI-FUwGwE2GqUiQamGVY0N3QTua5GQOh-lOdLU/exec"
        };
        
        const speakers = meetingData.speakers.map(s => s.name);
        const evaluators = meetingData.agenda_items
            .filter(item => item.event.includes("Evaluate speech") || item.event.includes("Table Topics Evaluator"))
            .map(item => item.presenter);

        // Note: Google Apps Script may need CORS configuration to accept requests from a browser.
        // A simple `doPost` that returns `ContentService.createTextOutput(JSON.stringify({status: 'success'})).setMimeType(ContentService.MimeType.JSON)`
        // and setting headers correctly is often required.
        const postData = async (url, options) => {
            try {
                await fetch(url, {
                    method: 'POST',
                    mode: 'no-cors', // Use 'no-cors' if CORS is not configured on the Google App Script side
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ options })
                });
            } catch (e) {
                console.warn(`Could not update form at ${url}:`, e);
            }
        };

        await Promise.all([
            postData(urls.feedback_form, speakers),
            postData(urls.speaker_form, speakers),
            postData(urls.evaluator_form, evaluators)
        ]);
    }
    
    /**
     * Replaces placeholders in the pptx file and triggers a download.
     * Updated to use JSZip instead of PizZip
     */
    async function updatePptxPresentation(templatePath, outputPath, meetingData) {
        try {
            const response = await fetch(templatePath);
            if (!response.ok) {
                throw new Error(`Could not fetch template file at ${templatePath}`);
            }
            const templateArrayBuffer = await response.arrayBuffer();
            
            // Load the ZIP file using JSZip
            const zip = await JSZip.loadAsync(templateArrayBuffer);

            const replacements = {};
            replacements["{{meeting_date}}"] = meetingData.meeting_info.meeting_date || "N/A";
            replacements["{{next_meeting_date}}"] = meetingData.meeting_info.next_meeting_date || "N/A";
            replacements["{{word_of_the_day}}"] = meetingData.meeting_info.word_of_the_day || "N/A";
            replacements["{{meeting_theme}}"] = meetingData.meeting_info.meething_theme || "N/A";

            const rolesPresentersTime = getRolesAndPresenters(meetingData);
            for (const [roleKey, info] of Object.entries(rolesPresentersTime)) {
                replacements[`{{${roleKey}_Presenter}}`] = info.presenter;
                replacements[`{{${roleKey}_Min}}`] = info.min_time;
                replacements[`{{${roleKey}_Max}}`] = info.max_time;
            }

            meetingData.speakers.forEach((speaker, i) => {
                if (i >= 3) return; // Max 3 speakers
                const num = i + 1;
                replacements[`{{Speaker${num}_Name}}`] = speaker.name || "N/A";
                replacements[`{{Speaker${num}_Project}}`] = speaker.project || "N/A";
                replacements[`{{Speaker${num}_Title}}`] = speaker.title || "N/A";
                replacements[`{{Speaker${num}_Description}}`] = speaker.description || "N/A";
                replacements[`{{Speaker${num}_Min}}`] = speaker.duration_green || "N/A";
                replacements[`{{Speaker${num}_Max}}`] = speaker.duration_red || "N/A";
            });
            
            // Process all slide XML files and perform replacements
            const slidePromises = [];
            
            zip.forEach((relativePath, file) => {
                if (relativePath.startsWith('ppt/slides/slide') && relativePath.endsWith('.xml')) {
                    slidePromises.push(
                        file.async('text').then(content => {
                            // Perform all replacements
                            let updatedContent = content;
                            for (const [placeholder, value] of Object.entries(replacements)) {
                                // Escape special regex characters in placeholder
                                const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                updatedContent = updatedContent.replace(new RegExp(escapedPlaceholder, 'g'), value);
                            }
                            
                            // Update the file in the ZIP
                            zip.file(relativePath, updatedContent);
                            return relativePath;
                        })
                    );
                }
            });
            
            // Wait for all slide processing to complete
            await Promise.all(slidePromises);
            
            // Generate the updated ZIP file
            const updatedBlob = await zip.generateAsync({
                type: 'blob',
                mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            });
            
            // Trigger download
            const link = document.createElement('a');
            link.href = URL.createObjectURL(updatedBlob);
            link.download = outputPath;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up the object URL
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
            
        } catch (error) {
            console.error('Error updating PowerPoint presentation:', error);
            throw new Error(`Failed to update presentation: ${error.message}`);
        }
    }
});