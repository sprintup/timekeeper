# Timekeeper

Timekeeper is a lightweight browser-based time tracker for organizing a day of work into activities, task boxes, and time categories. It runs as a static HTML/CSS/JavaScript app and saves data in the browser with local storage.

## User Guide

### Track Your Day

Use the time pane to set a daily time target in hours and minutes. The app shows total elapsed time, total work time excluding Personal, remaining time, bucket totals for Admin, Operations, Projects, and Personal, and all activity totals ordered by priority.

When remaining time reaches zero, Timekeeper plays a chime.

### Activities

Activities are the horizontal work lanes on the board. Use **Add Activity** to create a new activity, then name it for a priority, project, workstream, or outcome.

Each activity shows:

- Priority number
- Activity name
- Subtotal time for all task boxes in that activity
- Notes, rename, and delete controls
- Priority dropdown for moving the activity to another position

Deleting an activity also deletes the task boxes and time logs inside that activity.

### Task Boxes

Use **Add task** inside an activity to add work. Each task box has an objective and a bucket:

- **Admin**: vacation, sick time, holidays, professional development, email, and meetings not tied to a project
- **Operations**: service requests, incidents, existing responsibilities, break/fix work, and delivery support
- **Projects**: temporary work with a start and end date that creates a unique service, product, or outcome
- **Personal**: breaks, meals, personal time, appointments, and other time outside work categories

The bucket dropdown is color coded. Drag task boxes within or across activities to reorganize the board without changing activity priority.

Use **Urgent** on a task box to give it a red border and show a red urgent flag below the activity totals. If an urgent task is running, the task box stays green while the border remains red. Urgent tasks move left within their activity, after any running task.

Use **Focus** on a task box to highlight it in the standup summary's "What I'm doing today" section. The task tile and focus count stay in sync with highlights toggled directly in the standup summary. Use the **summary** pill in the activity totals pane to open the standup summary quickly.

### Timers And Logs

Click **Start** on a task box to begin timing, or use **Start** when creating a task. Use **Save as Urgent** to create a task already marked urgent. Starting a task moves it to the far left of its current activity without changing the activity priority. Starting another task pauses the current one. Click **Pause** to stop the active timer.

When any task is running, the browser tab favicon turns green so you can spot an active timer from another tab.

Use **Time log** to review, add, edit, delete, or nudge time entries for a task box. Time log entries include their dates. Use the Start and End `-` / `+` controls to move those timestamps by one minute. Use **Notes** to open the notes modal without finishing the task.

Use **Finish** to mark a task complete and open the notes modal. Add, edit, delete, flag, or unflag notes there; finished tasks are marked in report task lines. Press **Finish** again on a completed task to add or manage notes. Completed task boxes move to the end of their activity and are no longer urgent. Use **Flagged Notes** in the activity totals pane to review follow-up notes, jump back to the task notes, or unflag them. Use **Hide Finished** to hide or show finished task boxes.

Use the activity **Quickview** button to preview every task in that activity in the same order as the board, along with any notes and finished-task markers. Tasks in Quickview are collapsible, with **Unfold all** and **Fold all** controls at the top.

### Reports

Click **Generate report** to preview the aggregated report for all current time logs. The top time pane still shows today's time only. The report includes:

- Bucket totals with percentages of the total report time
- Activity totals sorted by most time, with percentages, Markdown activity headings, task notes, flagged note markers, finished markers in task lines, and a marker for tasks that were marked urgent
- Timeline of worked dates and times, separated by day with total time and a bucket breakdown summary, and listed with task, elapsed time, bucket, and urgent markers
- Exported JSON data below the timeline

You can download the report as a Markdown file, copy it to the clipboard, or open a prefilled email draft with the report content. The **Delete logs and completed tasks on download** checkbox is checked by default when the report modal opens.

### Moving Data

Use **Export** to download a JSON backup of the current activities, task boxes, time logs, notes, and time target. On another computer or browser, use **Import** and select that JSON file. Importing replaces the Timekeeper data saved in that browser.

### Reset

Use **Reset** to clear all saved Timekeeper state from this browser, including activities, task boxes, time logs, and the time target.

## Data Storage

Timekeeper stores data in browser local storage. Data stays on the current browser and device unless you download, email, or manually save a report elsewhere. Deleting cookies and site data for this site deletes all details, so it is best to run Timekeeper on a side computer or export backups before clearing site data.

## Running Locally

Open `index.html` in a browser. No build step or server is required.
