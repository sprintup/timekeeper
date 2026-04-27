As a user
When I open the page
Then I am shown time boxes for things I'd like to accomlish today. These time boxes are units of work with an objective and time bucket that I insert when starting the unit of work (task box). There is a started time and elapsed time, when when it's finished, there is a finished time. Each time the task box is started and paused, a new time log is recorded for that task. A 

As a use with a running task box
When a side quest comes up like a teams call or incident, I can make a side quest, which is basically just another task box, but with a higher urgency
Then when I start the new task box to the right, the initial task box's timer will pause and the new timer will begin. There should only ever be 1 timer, maximum, running at any time. If a timer in a task box from a lower importance row is started, it should be raised to the top row and the top row should be moved down to the second row. 

As a user with a top row of task boxes
When I add a new lower importance time box, it shows up on the next line. 
Then I am able to rearrange all task boxes, horizontally or vertically, with drag and drop.

As a user with a time box running
When I press finished, the elapsed time for that bucket is the total of all the time logs for that task item. The task box turns grey to indicate a passive status and a "restart" button appears that will change it back to an active status (white background). If it is active and running it is light green. If it's unstarted, it's just white.
Then at the end of the day, I can use the buttons in the header section to generate a report that will show how much time was spent in each time bucket (admin, operations, projects). The report will just add together how much time was spent in each bucket. If I stop the timer, there is an end time that is recorded on that time log. 

As a user with a time log on a task item
When I want to modify the time log on that task
Then I can delete any time log item and manually add an amount of time using a modal pop up. 

As a user with tasks with time logs
When I press generate today's report
Then it will download a document with a summary of all the time logs broken down by bucket. So it will show Admin - x hours:mins, Operations x hours:mins, Projects x hours:mins. Further, there will be an additional section that shows the the actual objectives worked on by time. It will have a date range of the report and will also ask if you want to delete the completed tasks. 