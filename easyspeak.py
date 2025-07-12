from dataclasses import dataclass, asdict
import requests
from typing import List, Dict
from bs4 import BeautifulSoup
import re
import json # Import json for pretty printing

@dataclass
class TimeSlot:
    time: str
    role: str
    presenter: str
    event: str
    duration_green: str
    duration_amber: str
    duration_red: str

@dataclass
class Speaker:
    position: str
    name: str
    project: str
    description: str
    time: str
    duration_green: str
    duration_amber: str
    duration_red: str

@dataclass
class MeetingInfo:
    club_name: str
    district: str
    division: str
    area: str
    club_number: str
    meeting_date: str
    meeting_time: str
    venue: str
    schedule: str

@dataclass
class ToastmastersMeeting:
    meeting_info: MeetingInfo
    agenda_items: List[TimeSlot]
    speakers: List[Speaker]
    attending_members: List[str]
    next_meeting: str


def scrape_easyspeak_agenda(html_content: str) -> ToastmastersMeeting:
    """
    Scrapes the HTML content of an EasySpeak agenda page and extracts meeting details,
    agenda items, speakers, attending members, and next meeting information.

    Args:
        html_content: The full HTML content of the EasySpeak agenda page.

    Returns:
        A ToastmastersMeeting dataclass object containing the scraped data.
    """
    soup = BeautifulSoup(html_content, 'html.parser')

    # --- Extract Meeting Information ---
    club_name_elem = soup.find('a', class_='maintitle')
    club_name = club_name_elem.text.strip() if club_name_elem else ""

    # Extract district info
    district_info_elem = soup.find('span', class_='gensmall', string=re.compile(r'District \d+'))
    district = division = area = club_number = ""
    if district_info_elem:
        district_text = district_info_elem.text.strip()
        # Parse "District 95, Division B, Area 4, Club Number 7928"
        parts = district_text.split(', ')
        if len(parts) >= 4:
            district = parts[0].replace('District ', '')
            division = parts[1].replace('Division ', '')
            area = parts[2].replace('Area ', '')
            club_number = parts[3].replace('Club Number ', '')

    # Extract meeting date
    meeting_date = ""
    # Find all spans with class 'postbody' and then search their text for the date pattern
    postbody_spans = soup.find_all('span', class_='postbody')
    for span in postbody_spans:
        # This regex is more general to capture various date formats like "Tuesday 12th July 2025"
        date_match = re.search(r'(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d+\w*\s+\w+\s+\d{4}', span.text.strip())
        if date_match:
            meeting_date = date_match.group()
            break # Found the date, no need to search further

    meeting_time_elem = soup.find('b', string=re.compile(r'\d{1,2}:\d{2}')) # More specific regex for time
    meeting_time = meeting_time_elem.text.strip() if meeting_time_elem else ""

    # Extract venue
    venue = ""
    # Find all spans with class 'postbody' and then search their text for 'Venue '
    for span in postbody_spans: # Re-using postbody_spans from above
        if 'Venue ' in span.text:
            venue = span.text.strip().replace('Venue ', '').strip()
            break # Found the venue, no need to search further

    # Extract schedule
    schedule_elem = soup.find('span', class_='gensmall', string=re.compile(r'Every'))
    schedule = schedule_elem.text.strip() if schedule_elem else ""

    meeting_info = MeetingInfo(
        club_name=club_name,
        district=district,
        division=division,
        area=area,
        club_number=club_number,
        meeting_date=meeting_date,
        meeting_time=meeting_time,
        venue=venue,
        schedule=schedule
    )

    # --- Extract Agenda Items and Speakers ---
    agenda_items = []
    speakers = []

    # Find the main agenda table
    main_table = soup.find('table', {'border': '0', 'cellpadding': '1', 'cellspacing': '2'})
    if main_table:
        rows = main_table.find_all('tr')

        for row in rows:
            cells = row.find_all('td')
            # Ensure there are enough cells to parse a time slot and durations
            if len(cells) >= 5:
                # Check if this is a data row (has time in the first cell)
                time_cell = cells[0].find('span', class_='gensmall')
                if time_cell and time_cell.text.strip() and ':' in time_cell.text:
                    time = time_cell.text.strip()

                    role_cell = cells[1].find('span', class_='gen')
                    role = role_cell.text.strip() if role_cell else ""

                    presenter_cell = cells[2].find('span', class_='gen')
                    presenter = presenter_cell.text.strip() if presenter_cell else ""

                    event_cell = cells[3].find('span', class_='gensmall')
                    event = event_cell.text.strip() if event_cell else ""

                    # Extract duration times from the 5th cell (index 4)
                    duration_green = ""
                    duration_amber = ""
                    duration_red = ""
                    if len(cells) > 4:
                        # Find the single span containing all durations
                        duration_span_elem = cells[4].find('span', class_='gensmall')
                        if duration_span_elem:
                            # Split the text by one or more whitespace characters (including non-breaking space)
                            durations_text = duration_span_elem.text.strip()
                            duration_parts = re.split(r'\s+', durations_text)

                            if len(duration_parts) > 0:
                                duration_green = duration_parts[0]
                            if len(duration_parts) > 1:
                                duration_amber = duration_parts[1]
                            if len(duration_parts) > 2:
                                duration_red = duration_parts[2]

                    time_slot = TimeSlot(
                        time=time,
                        role=role,
                        presenter=presenter,
                        event=event,
                        duration_green=duration_green,
                        duration_amber=duration_amber,
                        duration_red=duration_red
                    )
                    agenda_items.append(time_slot)

                    # Check if this is a speaker slot
                    if "Speaker" in role:
                        # Look for the next row which might contain project details
                        next_row = row.find_next_sibling('tr')
                        project_description = ""
                        if next_row:
                            project_cell = next_row.find('span', class_='gensmall')
                            if project_cell and project_cell.find('i'): # Check for italic tag indicating project
                                project_description = project_cell.text.strip()

                        speaker = Speaker(
                            position=role,
                            name=presenter,
                            project=project_description.split(' - ')[0] if ' - ' in project_description else "",
                            description=project_description.split(' - ')[
                                1] if ' - ' in project_description else project_description,
                            time=time,
                            duration_green=duration_green,
                            duration_amber=duration_amber,
                            duration_red=duration_red
                        )
                        speakers.append(speaker)

    # --- Extract Attending Members ---
    attending_members = []
    # Find the section header for 'Attending'
    attending_section = soup.find('span', class_='cattitle', string='Attending')
    if attending_section:
        # The members are usually in a table directly after this section title
        attending_table = attending_section.find_parent('table')
        if attending_table:
            # Find all cells that might contain member names
            member_cells = attending_table.find_all('td', class_='gensmall')
            for cell in member_cells:
                # Split the text by comma, semicolon, newline, or carriage return
                raw_names = re.split(r'[,;\n\r]+', cell.text.strip())
                for name in raw_names:
                    cleaned_name = name.strip()
                    # Filter out empty strings and the header "Member"
                    if cleaned_name and cleaned_name != "Member":
                        attending_members.append(cleaned_name)

    # --- Extract Next Meeting Info ---
    next_meeting = ""
    next_meeting_elem = soup.find('span', class_='cattitle', string='Next Meeting')
    if next_meeting_elem:
        # The next meeting info is often in a sibling span with class 'gensmall'
        next_meeting_info = next_meeting_elem.find_next_sibling('span', class_='gensmall')
        if next_meeting_info:
            next_meeting = next_meeting_info.text.strip()

    return ToastmastersMeeting(
        meeting_info=meeting_info,
        agenda_items=agenda_items,
        speakers=speakers,
        attending_members=attending_members,
        next_meeting=next_meeting
    )

def get_roles_and_presenters(meeting_data: ToastmastersMeeting) -> Dict[str, Dict[str, str]]:
    """
    Extracts a dictionary mapping roles to their presenters, minimum time, and maximum time
    from the ToastmastersMeeting object.

    Args:
        meeting_data: A ToastmastersMeeting dataclass object.

    Returns:
        A dictionary where keys are roles (str) and values are dictionaries containing:
        - 'presenter': str (presenter's name, empty string if none)
        - 'min_time': str (duration_green)
        - 'max_time': str (duration_red)
    """
    roles_info = {}
    for item in meeting_data.agenda_items:
        if not item.role or item.role == 'Break':
            continue
        roles_info[item.role] = {
            'presenter': item.presenter if item.presenter else "",
            'min_time': item.duration_green,
            'max_time': item.duration_red
        }
    return roles_info

# --- Main execution ---
if __name__ == "__main__":
    # 1. Get URL and cookie from the user
    agenda_url = input("Enter the EasySpeak agenda URL: ")
    cookie_string = input("Paste the Cookie string from your browser's developer tools: ")

    if not agenda_url or not cookie_string:
        print("URL and cookie string are required. Exiting.")
    else:
        # 2. Set up headers for the web request
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Cookie': cookie_string
        }

        try:
            # 3. Fetch the HTML content from the URL
            print("\nFetching agenda from URL...")
            response = requests.get(agenda_url, headers=headers)
            response.raise_for_status()  # This will raise an error for bad responses (4xx or 5xx)

            # 4. Scrape the agenda to create the Python object
            agenda_object = scrape_easyspeak_agenda(response.text)

            # 5. Print the resulting object as formatted JSON
            print("\n--- Scraped Agenda Object (JSON) ---")
            # Use ensure_ascii=False to display non-ASCII characters directly
            print(json.dumps(asdict(agenda_object), indent=2, ensure_ascii=False))

            # 6. Print the roles and presenters with time frames
            print("\n--- Roles, Presenters, and Time Frames ---")
            roles_presenters_time = get_roles_and_presenters(agenda_object)
            for role, info in roles_presenters_time.items():
                presenter_text = info['presenter'] if info['presenter'] else "(No presenter assigned)"
                print(f"{role}: {presenter_text} (Min: {info['min_time']}, Max: {info['max_time']})")

        except requests.exceptions.RequestException as e:
            print(f"\nAn error occurred while fetching the URL: {e}")
        except Exception as e:
            print(f"\nAn unexpected error occurred: {e}")
