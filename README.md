# Timekeeper

Timekeeper is a lightweight browser-based time tracker for organizing a day of work into goals, task boxes, and time categories. It runs as a static HTML/CSS/JavaScript app and saves data in the browser with local storage.

## User Guide

### Track Your Day

Use the time pane at the top to set a daily time goal in hours and minutes. The app shows total elapsed time, remaining time, bucket totals for Admin, Operations, Projects, and Break, and goal totals for the day.

When remaining time reaches zero, Timekeeper plays a chime.

### Goals

Goals are the horizontal work lanes on the board. Use **Add Goal** to create a new goal, then name it for a priority, project, workstream, or outcome.

Each goal shows:

- Priority number
- Goal name
- Subtotal time for all task boxes in that goal
- Rename and delete controls
- A drag handle for moving the goal up or down

Deleting a goal also deletes the task boxes and time logs inside that goal.

### Task Boxes

Use **Add task** inside a goal to add work. Each task box has an objective and a bucket:

- **Admin**: vacation, sick time, holidays, professional development, email, and meetings not tied to a project
- **Operations**: service requests, incidents, existing responsibilities, break/fix work, and delivery support
- **Projects**: temporary work with a start and end date that creates a unique service, product, or outcome
- **Break**: breaks, meals, personal time, appointments, and other time outside work categories

The bucket dropdown is color coded. Drag task boxes within or across goals to reorganize the board without changing goal priority.

Use **Urgent** on a task box to give it a red border and show a red urgent flag above the goal breakdown. If an urgent task is running, the task box stays green while the border remains red.

### Timers And Logs

Click **Start** on a task box to begin timing, or use **Save and start** when creating a task. Starting a task in a lower priority goal promotes that whole goal to Priority 1 and moves the task to the left of that goal. Starting another task pauses the current one. Click **Pause** to stop the active timer.

Use **Show time log** to review, add, edit, delete, or nudge time entries for a task box. Use `+` to move a log start time one minute earlier and `-` to move a stopped log's end time one minute later. Use **Show notes** to open the notes modal without finishing the task.

Use **Finish** to mark a task complete and open the notes modal. Add, edit, or delete notes there; finished tasks with no notes appear in reports as `finished`. Press **Finish** again on a completed task to add or manage notes. Completed task boxes move to the end of their goal. Use **Clear completed tasks** to remove finished task boxes.

### Reports

Click **Generate report** to preview the report for today. The report includes:

- Bucket totals
- Goal totals sorted by most time, with indented objective totals and task notes
- Timeline of worked time, listed at the bottom with task notes at the end of each entry

You can download the report as a text file or open a prefilled email draft with the report content. The **Delete time logs after download** checkbox is checked by default when the report modal opens.

### Moving Data

Use **Export data** to download a JSON backup of the current goals, task boxes, time logs, notes, and time goal. On another computer or browser, use **Import data** and select that JSON file. Importing replaces the Timekeeper data saved in that browser.

### Reset

Use **Reset** to clear all saved Timekeeper state from this browser, including goals, task boxes, time logs, and the time goal.

## Data Storage

Timekeeper stores data in browser local storage. Data stays on the current browser and device unless you download, email, or manually save a report elsewhere.

## Running Locally

Open `index.html` in a browser. No build step or server is required.
