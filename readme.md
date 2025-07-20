# EasySpeak Agenda to Presentation Converter

This script helps Toastmasters clubs easily convert their EasySpeak meeting agendas into a presentation file and update Google Forms for feedback.

---

## Installation (Only Once)

### Step 1: Download Python

This script requires Python to run. Python is a popular programming language that's free to download and install.

* **For Windows:**
    1.  Go to the official Python website: [https://www.python.org/downloads/windows/](https://www.python.org/downloads/windows/)
    2.  Click on the link to download the latest **Python 3** version (e.g., "Windows installer (64-bit)").
    3.  Run the downloaded installer.
    4.  **IMPORTANT:** On the first screen of the installer, **make sure to check the box that says "Add python.exe to PATH"** before clicking "Install Now". This makes it much easier to run Python from your command prompt.
    5.  Follow the rest of the installation prompts.

* **For Mac:**
    1.  Go to the official Python website: [https://www.python.org/downloads/macos/](https://www.python.org/downloads/macos/)
    2.  Click on the link to download the latest **Python 3** version (e.g., "macOS 64-bit universal2 installer").
    3.  Run the downloaded installer and follow the prompts.

* **For Linux (Ubuntu/Debian-based distributions):**
    Python 3 is usually pre-installed on most Linux distributions. You can check by opening a terminal (search for "Terminal" in your applications) and typing:
    ```bash
    python3 --version
    ```
    If it's not installed or if you need to update it, you can typically install it using your package manager:
    ```bash
    sudo apt update
    sudo apt install python3 python3-pip
    ```

---

### Step 2: Download the Script Files

You need to download all the files from the EasySpeakTemplate GitHub repository.

1.  Go to the GitHub repository: [https://github.com/haakoaho/EasySpeakTemplate](https://github.com/haakoaho/EasySpeakTemplate)
2.  On the right side of the page, click the green "< > Code" button.
3.  From the dropdown menu, select "Download ZIP".
4.  Unzip the downloaded file (e.g., `EasySpeakTemplate-main.zip`) to a folder on your computer where you want to keep the script (e.g., `C:\EasySpeakTool` on Windows or `~/Documents/EasySpeakTool` on Mac/Linux).
    * **Make sure the `easyspeak.py` and `template.odp` files are directly inside this folder after unzipping.**

---

### Step 3: Install Required Libraries

The script uses a few extra tools (libraries) that need to be installed. We've provided a `requirements.txt` file to make this easy.

1.  **Open your command prompt or terminal:**
    * **Windows:** Search for "cmd" or "Command Prompt" in your Start Menu and open it.
    * **Mac:** Search for "Terminal" in Spotlight (Cmd + Space) or find it in `Applications/Utilities`.
    * **Linux:** Open your preferred terminal application.

2.  **Navigate to the script's folder:** In the command prompt/terminal, type `cd` (change directory) followed by the path to the folder where you unzipped the files.
    * **Example (Windows):**
        ```cmd
        cd C:\EasySpeakTool
        ```
    * **Example (Mac/Linux):**
        ```bash
        cd ~/Documents/EasySpeakTool
        ```
    Press Enter after typing the command.

3.  **Install the libraries:** Once you are in the correct folder, run the following command:
    * **Windows:**
        ```cmd
        py -m pip install -r requirements.txt
        ```
    * **Mac/Linux:**
        ```bash
        pip3 install -r requirements.txt
        ```
    This command will download and install everything the script needs. You might see some text scrolling by; just wait for it to finish.

---

## Run the script (every week)

Now you're ready to run the `easyspeak.py` script!

1.  **Stay in the same command prompt/terminal window** from Step 3 (or open a new one and navigate to the script's folder again).

2.  **Run the script:**
    * **Windows:**
        ```cmd
        py easyspeak.py
        ```
    * **Mac/Linux:**
        ```bash
        python3 easyspeak.py
        ```

3.  **Follow the prompts:** 
4.  Find the agenda page of your meeting in EasySPeak.

5.  **Wait for the script to finish:** The script will fetch the agenda, process it, and then tell you:
    * "Presentation successfully created at: presentation.odp"
    * "Updating the forms"

    You will find a new file named `presentation.odp` in the same folder where your script is located. This is your updated presentation! The script will also attempt to update relevant Google Forms for voting and feedback.

---

## Troubleshooting

* **"Error: Template file not found at 'template.odp'"**: Make sure the `template.odp` file is in the same folder as `easyspeak.py`. It should have been downloaded with the other script files.
* **Permissions errors during installation**: If you see "Permission denied" errors during Step 3, try running the command with `sudo` on Mac/Linux (e.g., `sudo pip3 install -r requirements.txt`) or by opening your command prompt as an administrator on Windows.
* **Python not found**: If commands like `py` or `python3` don't work, go back to Step 1 and ensure Python was installed correctly, especially checking the "Add python.exe to PATH" box on Windows.

If you have any issues, please check the GitHub repository for updates or open an issue there for assistance.