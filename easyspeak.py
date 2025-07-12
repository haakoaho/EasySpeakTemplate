from dataclasses import dataclass, asdict
import requests
from typing import List, Dict
from bs4 import BeautifulSoup
import re
import json
import zipfile
import os
import shutil

# Your existing dataclasses remain the same.
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

    district_info_elem = soup.find('span', class_='gensmall', string=re.compile(r'District \d+'))
    district = division = area = club_number = ""
    if district_info_elem:
        district_text = district_info_elem.text.strip()
        parts = district_text.split(', ')
        if len(parts) >= 4:
            district = parts[0].replace('District ', '')
            division = parts[1].replace('Division ', '')
            area = parts[2].replace('Area ', '')
            club_number = parts[3].replace('Club Number ', '')

    meeting_date = ""
    postbody_spans = soup.find_all('span', class_='postbody')
    for span in postbody_spans:
        date_match = re.search(r'(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d+\w*\s+\w+\s+\d{4}', span.text.strip())
        if date_match:
            meeting_date = date_match.group()
            break

    meeting_time_elem = soup.find('b', string=re.compile(r'\d{1,2}:\d{2}'))
    meeting_time = meeting_time_elem.text.strip() if meeting_time_elem else ""

    venue = ""
    for span in postbody_spans:
        if 'Venue ' in span.text:
            venue = span.text.strip().replace('Venue ', '').strip()
            break

    schedule_elem = soup.find('span', class_='gensmall', string=re.compile(r'Every'))
    schedule = schedule_elem.text.strip() if schedule_elem else ""

    meeting_info = MeetingInfo(club_name, district, division, area, club_number, meeting_date, meeting_time, venue, schedule)

    # --- Extract Agenda Items and Speakers ---
    agenda_items = []
    speakers = []
    main_table = soup.find('table', {'border': '0', 'cellpadding': '1', 'cellspacing': '2'})
    if main_table:
        rows = main_table.find_all('tr')
        for row in rows:
            cells = row.find_all('td')
            if len(cells) < 5:
                continue

            time_cell = cells[0].find('span', class_='gensmall')
            if not (time_cell and time_cell.text.strip() and ':' in time_cell.text):
                continue
            
            time = time_cell.text.strip()
            role = cells[1].find('span', class_='gen').text.strip() if cells[1].find('span', class_='gen') else ""
            presenter = cells[2].find('span', class_='gen').text.strip() if cells[2].find('span', class_='gen') else ""
            event = cells[3].find('span', class_='gensmall').text.strip() if cells[3].find('span', class_='gensmall') else ""
            
            duration_green, duration_amber, duration_red = "", "", ""
            duration_span_elem = cells[4].find('span', class_='gensmall')
            if duration_span_elem:
                duration_parts = re.split(r'\s+', duration_span_elem.text.strip())
                if len(duration_parts) > 0: duration_green = duration_parts[0]
                if len(duration_parts) > 1: duration_amber = duration_parts[1]
                if len(duration_parts) > 2: duration_red = duration_parts[2]

            agenda_items.append(TimeSlot(time, role, presenter, event, duration_green, duration_amber, duration_red))

            if "Speaker" in role:
                project_description = ""
                next_row = row.find_next_sibling('tr')
                if next_row and next_row.find('span', class_='gensmall') and next_row.find('span', class_='gensmall').find('i'):
                    project_description = next_row.find('span', class_='gensmall').text.strip()
                
                project = project_description.split(' - ')[0] if ' - ' in project_description else ""
                description = project_description.split(' - ')[1] if ' - ' in project_description else project_description
                speakers.append(Speaker(role, presenter, project, description, time, duration_green, duration_amber, duration_red))

    # --- Extract Attending Members ---
    attending_members = []
    attending_section = soup.find('span', class_='cattitle', string='Attending')
    if attending_section and attending_section.find_parent('table'):
        member_cells = attending_section.find_parent('table').find_all('td', class_='gensmall')
        for cell in member_cells:
            raw_names = re.split(r'[,;\n\r]+', cell.text.strip())
            for name in raw_names:
                cleaned_name = name.strip()
                if cleaned_name and cleaned_name != "Member":
                    attending_members.append(cleaned_name)

    # --- Extract Next Meeting Info ---
    next_meeting = ""
    next_meeting_elem = soup.find('span', class_='cattitle', string='Next Meeting')
    if next_meeting_elem and next_meeting_elem.find_next_sibling('span', class_='gensmall'):
        next_meeting = next_meeting_elem.find_next_sibling('span', class_='gensmall').text.strip()

    return ToastmastersMeeting(meeting_info, agenda_items, speakers, attending_members, next_meeting)


def get_roles_and_presenters(meeting_data: ToastmastersMeeting) -> Dict[str, Dict[str, str]]:
    """
    Extracts a dictionary mapping roles to their presenters and time frames.
    """
    roles_info = {}
    for item in meeting_data.agenda_items:
        if not item.role or item.role == 'Break':
            continue
        # Sanitize role name to be a valid placeholder key
        sanitized_role = re.sub(r'[^a-zA-Z0-9]', '', item.role)
        roles_info[sanitized_role] = {
            'presenter': item.presenter if item.presenter else "N/A",
            'min_time': item.duration_green if item.duration_green else "N/A",
            'max_time': item.duration_red if item.duration_red else "N/A"
        }
    return roles_info

def update_odp_presentation(template_path: str, output_path: str, roles_info: Dict[str, Dict[str, str]]):
    """
    Updates a LibreOffice Impress (.odp) presentation by replacing placeholders.
    An .odp file is a zip archive containing XML files. The main content is in 'content.xml'.
    This function extracts the archive, replaces text in content.xml, and re-zips it.

    Args:
        template_path: Path to the template .odp file.
        output_path: Path to save the updated .odp file.
        roles_info: A dictionary with role information for replacement.
    """
    if not os.path.exists(template_path):
        print(f"Error: Template file not found at '{template_path}'")
        return

    # Create a temporary directory for manipulation
    temp_dir = "odp_temp"
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir)

    try:
        # 1. Unzip the .odp template file
        with zipfile.ZipFile(template_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)

        # 2. Read the content.xml file
        content_xml_path = os.path.join(temp_dir, "content.xml")
        if not os.path.exists(content_xml_path):
            print("Error: content.xml not found in the template.")
            return
            
        with open(content_xml_path, 'r', encoding='utf-8') as f:
            content_xml = f.read()

        # 3. Perform the text replacements
        for role_key, info in roles_info.items():
            content_xml = content_xml.replace(f"{{{{{role_key}_Presenter}}}}", info.get('presenter', 'N/A'))
            content_xml = content_xml.replace(f"{{{{{role_key}_Min}}}}", info.get('min_time', 'N/A'))
            content_xml = content_xml.replace(f"{{{{{role_key}_Max}}}}", info.get('max_time', 'N/A'))
        
        # Also replace the main role titles if needed
        # This part is more complex as the original role names have spaces/special chars
        # For simplicity, we are focusing on presenter and times.

        # 4. Write the modified content back to content.xml
        with open(content_xml_path, 'w', encoding='utf-8') as f:
            f.write(content_xml)

        # 5. Re-zip the contents into the new .odp file (overwrites if exists)
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zip_out:
            for root, _, files in os.walk(temp_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, temp_dir)
                    zip_out.write(file_path, arcname)
        
        print(f"\nPresentation successfully created at: {output_path}")

    except Exception as e:
        print(f"An error occurred during ODP creation: {e}")
    finally:
        # Clean up the temporary directory
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)


# --- Main execution ---
if __name__ == "__main__":
    # 1. Get user input for agenda URL and cookie
    agenda_url = input("Enter the EasySpeak agenda URL: ")
    cookie_string = input("Paste the Cookie string from your browser's developer tools: ")

    # Hardcoded file names for simplicity. The script will look for 'template.odp'
    # in the same directory and create/overwrite 'presentation.odp'.
    template_file = "template.odp"
    output_file = "presentation.odp"

    if not all([agenda_url, cookie_string]):
        print("URL and cookie string are required. Exiting.")
    else:
        # 2. Set up headers for the web request
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Cookie': cookie_string
        }

        try:
            # 3. Fetch and scrape the agenda
            print("\nFetching agenda from URL...")
            response = requests.get(agenda_url, headers=headers)
            response.raise_for_status()
            agenda_object = scrape_easyspeak_agenda(response.text)

            # 4. Extract role information
            roles_presenters_time = get_roles_and_presenters(agenda_object)
            print("\n--- Roles, Presenters, and Time Frames to be Inserted ---")
            for role, info in roles_presenters_time.items():
                print(f"{role}: {info['presenter']} (Min: {info['min_time']}, Max: {info['max_time']})")

            # 5. Update the .odp presentation
            print(f"\nUsing '{template_file}' to create/overwrite '{output_file}'...")
            update_odp_presentation(template_file, output_file, roles_presenters_time)

        except requests.exceptions.RequestException as e:
            print(f"\nAn error occurred while fetching the URL: {e}")
        except Exception as e:
            print(f"\nAn unexpected error occurred: {e}")
