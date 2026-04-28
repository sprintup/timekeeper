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

The bucket dropdown is color coded. Drag task boxes within or across goals to reorganize the board.

### Timers And Logs

Click **Start** on a task box to begin timing, or use **Save and start** when creating a task. Starting another task pauses the current one. Click **Pause** to stop the active timer.

Use **Show time log** to review, add, edit, or delete time entries for a task box.

Use **Finish** to mark a task complete. Timekeeper will ask for optional finish notes; blank notes appear in reports as `finished`. Completed task boxes move to the end of their goal. Use **Clear completed tasks** to remove finished task boxes.

### Reports

Click **Generate report** to preview the report for today. The report includes:

- Bucket totals
- Goal totals sorted by most time, with indented objective totals and finish notes
- Timeline of worked time, listed at the bottom with finish notes at the end of each finished task entry

You can download the report as a text file or open a prefilled email draft with the report content. The **Delete time logs after download** checkbox is checked by default when the report modal opens.

### Reset

Use **Reset** to clear all saved Timekeeper state from this browser, including goals, task boxes, time logs, and the time goal.

## Data Storage

Timekeeper stores data in browser local storage. Data stays on the current browser and device unless you download, email, or manually save a report elsewhere.

## Running Locally

Open `index.html` in a browser. No build step or server is required.
