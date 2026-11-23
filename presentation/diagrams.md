# RAM presentation diagram source

These Mermaid diagrams are editable source. In VS Code, open this Markdown file and use a Mermaid-compatible Markdown preview extension, or paste an individual diagram into a Mermaid renderer and export SVG/PNG for slides. Verify labels and layout after export.

## Figure 1. System context diagram
```mermaid
flowchart LR
  Student[Student] -->|Login, clock in/out, view own history| RAM((RAM System))
  Manager[Robotics Manager] -->|Manage student accounts, view attendance| RAM
  RAM -->|Confirmation, personal history| Student
  RAM -->|Account and attendance reports| Manager
  RAM <--> |Read and write user and attendance records| DB[(Attendance Database)]
```

## Figure 2. Use case diagram
```mermaid
flowchart LR
  Student[Student]
  Manager[Manager]
  subgraph System[Robotics Attendance Management System]
    UC1([Log in])
    UC2([Clock in])
    UC3([Clock out])
    UC4([View personal attendance history])
    UC5([Manage student accounts])
    UC6([View individual attendance])
    UC7([View program attendance report])
    UC8([Log out])
  end
  Student --- UC1
  Student --- UC2
  Student --- UC3
  Student --- UC4
  Student --- UC8
  Manager --- UC1
  Manager --- UC5
  Manager --- UC6
  Manager --- UC7
  Manager --- UC8
```

## Figure 3. Student attendance activity diagram
```mermaid
flowchart TD
  A([Start]) --> B[Open RAM on computer]
  B --> C[Enter email and password]
  C --> D{Credentials valid and account active?}
  D -- No --> E[Show login error]
  E --> C
  D -- Yes --> F[Display student dashboard]
  F --> G{Choose attendance action}
  G -- Clock in --> H{Already has active session?}
  H -- Yes --> I[Reject duplicate clock-in]
  I --> F
  H -- No --> J[Save clock-in timestamp]
  J --> K[Show clock-in confirmation]
  K --> F
  G -- Clock out --> L{Active session exists?}
  L -- No --> M[Reject clock-out]
  M --> F
  L -- Yes --> N[Save clock-out timestamp]
  N --> O[Calculate elapsed hours]
  O --> P[Save completed attendance record]
  P --> Q[Show hours and confirmation]
  Q --> F
  G -- View history --> R[Display personal attendance records]
  R --> F
  F --> S([Log out / End])
```

## Figure 4. Clock-in / clock-out sequence diagram
```mermaid
sequenceDiagram
  actor Student
  participant UI as RAM Interface
  participant Auth as Authentication
  participant Attendance as Attendance Service
  participant DB as SQLite Database
  Student->>UI: Submit login credentials
  UI->>Auth: POST /api/login
  Auth->>DB: Find account and verify password hash
  DB-->>Auth: User record and account status
  Auth-->>UI: Authenticated student session
  Student->>UI: Select Clock in
  UI->>Attendance: POST /api/attendance/clock-in
  Attendance->>DB: Check for active session
  DB-->>Attendance: No active session
  Attendance->>DB: Insert clock-in timestamp
  Attendance-->>UI: Clock-in confirmation
  Student->>UI: Select Clock out
  UI->>Attendance: POST /api/attendance/clock-out
  Attendance->>DB: Retrieve active attendance row
  DB-->>Attendance: Clock-in timestamp
  Attendance->>Attendance: Calculate elapsed hours
  Attendance->>DB: Update clock-out, hours, and status
  Attendance-->>UI: Completed session and hours
  UI-->>Student: Display confirmation
```

## Figure 5. Attendance state machine
```mermaid
stateDiagram-v2
  [*] --> NotClockedIn
  NotClockedIn --> ClockedIn: Valid clock-in / save timestamp
  ClockedIn --> ClockedOut: Valid clock-out / save end time and calculate hours
  ClockedOut --> NotClockedIn: Ready for next session
  NotClockedIn --> NotClockedIn: Clock-out rejected
  ClockedIn --> ClockedIn: Duplicate clock-in rejected
```

## Figure 6. UML class diagram
```mermaid
classDiagram
  class User {
    +int userId
    +string name
    +string email
    +string passwordHash
    +string role
    +string accountStatus
    +login()
    +logout()
  }
  class Student {
    +string studentNumber
    +viewAttendanceHistory()
    +clockIn()
    +clockOut()
  }
  class Manager {
    +createStudent()
    +editStudent()
    +deactivateStudent()
    +viewAttendanceReports()
  }
  class Attendance {
    +int attendanceId
    +datetime clockInTime
    +datetime clockOutTime
    +decimal totalHours
    +string status
    +calculateHours()
  }
  User <|-- Student
  User <|-- Manager
  Student "1" --> "0..*" Attendance : has
```

## Figure 7. Logical entity relationship diagram
```mermaid
erDiagram
  USER ||--o{ ATTENDANCE : records
  USER {
    int user_id PK
    varchar name
    varchar email UK
    varchar password_hash
    enum role
    enum account_status
    varchar student_number UK
    datetime created_at
  }
  ATTENDANCE {
    int attendance_id PK
    int user_id FK
    datetime clock_in_time
    datetime clock_out_time
    decimal total_hours
    enum attendance_status
    datetime created_at
  }
```

## Figure 8. Three-tier deployment diagram
```mermaid
flowchart TB
  subgraph Client[Client tier — student and manager computers]
    Browser[Desktop / laptop browser\nHTML + CSS + JavaScript]
  end
  subgraph App[Application tier]
    Server[Node.js + Express\nAuthentication, attendance rules, reporting]
  end
  subgraph Data[Data tier]
    SQLite[(SQLite database\nUSER and ATTENDANCE tables)]
  end
  Browser <-->|HTTPS in production / HTTP localhost in prototype| Server
  Server <-->|SQL queries and updates| SQLite
```

## Figure 9. Component / module diagram
```mermaid
flowchart TB
  UI[Presentation Interface]
  AUTH[Authentication and User Management]
  TRACK[Attendance Tracking]
  HOURS[Hours Calculation]
  REPORT[Attendance Reporting]
  DATA[Database Access / Persistence]
  UI --> AUTH
  UI --> TRACK
  UI --> REPORT
  TRACK --> HOURS
  AUTH --> DATA
  TRACK --> DATA
  REPORT --> DATA
```

## Figure 10. CRUD matrix
| Module | USER | ATTENDANCE |
|---|---|---|
| Authentication | R | — |
| User Management | C / R / U | — |
| Attendance Tracking | R | C / R / U |
| Hours Calculation | — | R / U |
| Attendance Reporting | R | R |
| Database Access | Supports authorized operations for the modules above; not an independent business CRUD actor | Supports authorized operations for the modules above |

Legend: C = Create, R = Read, U = Update, D = Delete. Normal manager workflow deactivates accounts rather than hard-deleting users so attendance history is retained.

## Figure 11. Requirements-to-test traceability
| Requirement | Demonstration / acceptance test |
|---|---|
| FR-01 Student login | Valid student can log in; invalid credentials are rejected |
| FR-02 Student clock-in | One active session is created; a second clock-in is rejected |
| FR-03 Clock-out and hours | Active session is closed and elapsed hours are saved |
| FR-04 Attendance history | Student sees only their own attendance records |
| FR-05 Manager account and attendance management | Manager can create/edit/deactivate students and view reports; student cannot access manager endpoints |
```

## Presentation note
Use the context, activity, sequence, state, class, ERD, and deployment diagrams as the core modeling visuals. The module diagram and CRUD/traceability matrices are supporting visuals. Keep text large enough to read from the back of the classroom.
