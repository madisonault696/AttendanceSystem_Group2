# RAM final presentation — slide outline

1. **Title:** Robotics Attendance Management (RAM), Group 2, team names, course, date.
2. **Problem and value:** Manual attendance issues; centralized digital attendance and participation-hour tracking.
3. **Customer and end users:** Robotics program; students and robotics manager; support staff and school IT as supporting stakeholders.
4. **Related work and differentiator:** Paper sheets, spreadsheets, general attendance tools; RAM focuses on student self-service and manager oversight for a robotics program. List only libraries/assets actually reused and their licenses.
5. **Functional requirements:** FR-01 login; FR-02 clock-in; FR-03 clock-out and calculate hours; FR-04 personal history; FR-05 manager account and attendance management.
6. **Non-functional requirements:** Security, integrity, performance, availability/recovery, usability. State measurable targets and distinguish proposed targets from verified test results.
7. **System context and use cases:** Figures 1–2.
8. **Three-tier architecture and deployment:** Figure 8; explain presentation, application, and data tiers.
9. **Attendance workflow and interaction:** Figures 3–4.
10. **Attendance states and class model:** Figures 5–6.
11. **Database and CRUD:** Figure 7 and Figure 10.
12. **Prototype walkthrough:** Login, student dashboard, clock-in/out, history, manager account management, report export. Use screenshots from the running app.
13. **Testing and limitations:** Show actual tests performed, pass/fail outcomes, and known limitations. Do not present untested claims as results.
14. **Work breakdown:** Task, owner, dates, and evidence from your team's actual work.
15. **Open source, licenses, and repository:** State the chosen project license, dependency licenses, and actual GitHub URL; do not invent these details.
16. **Conclusion and future work:** Achievements, remaining gaps, next improvements.

## Suggested prototype demo order
1. Sign in as student (`student@ram.local`).
2. Clock in; show the active session state.
3. Attempt a second clock-in; show the duplicate-session validation.
4. Clock out; show calculated hours.
5. Open personal attendance history.
6. Sign out and sign in as manager (`manager@ram.local`).
7. Create a student account, edit it, and deactivate/reactivate it.
8. Open the date-filtered attendance report and export CSV.
