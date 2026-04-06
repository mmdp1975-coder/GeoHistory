# Classroom Functional Specification

## Purpose

- Classroom is a controlled space inside GeoHistory to group users, assign one or more Journeys, and use them in an educational or research context.
- Classroom does not replace the core GeoHistory experience.
- The GeoHistory core experience remains:
  - map
  - timeline
  - events
  - audio
  - quiz

## Scope and Non-Goals

### In Scope

- Group users inside a Classroom.
- Assign one or more Journeys to a Classroom.
- Let students access assigned Journeys through Classroom access methods.
- Track Journey progress and quiz performance in the Classroom context.
- Show ranking starting from Classroom + Journey.

### Out of Scope

- A full school platform.
- A complex Journey editor.
- A chat system.
- Any duplicate of the core GeoHistory experience.

## Personas and Permissions

### Personas allowed to create and manage a Classroom

- teacher
- researcher

### Persona not allowed to create a Classroom

- student

## Classroom Ownership and Relationships

- Each Classroom has one owner.
- One owner can create multiple Classrooms.
- One Classroom can contain multiple Journeys.
- One Journey can be assigned to multiple Classrooms.
- One student can belong to multiple Classrooms.

## Classroom Contents

- Each Classroom contains:
  - class data
  - members
  - assigned Journeys
  - access methods
  - progress/performance data

## Access Model

### Access Modes

- private
- community
- open

### Access Rules

- Link, email, and QR code are only access channels.
- Access is decided by the Classroom access mode, not by QR code alone.
- Each Classroom has an invite link.
- The QR code is generated from the invite link.
- Email invitations must use the same invite-link logic.
- Future WhatsApp sharing must use the same invite-link logic.

## Journey Types in Classroom

- Two Journey types can be used in a Classroom:
  - existing GeoHistory Journeys
  - custom Journeys requested by the creator
- A custom Journey must live in the creator library, not only inside one Classroom.

## Creator Functional Flow

- Create Classroom.
- Edit title and description.
- Choose access mode.
- Copy invite link.
- Show QR code.
- Invite users.
- Assign one or more Journeys.
- Request custom Journey.
- View members.
- View progress and quiz results.

## Student Functional Flow

- Receive link or scan QR code.
- Open Classroom page.
- Login or register if needed.
- Enter Classroom.
- View assigned Journeys.
- Open Journey.
- Continue or complete Journey.
- Take quiz.
- View result and ranking.

## Progress and Quiz Performance

- Journey progress must be saved separately from quiz performance.
- Quiz must support multiple attempts.
- Each quiz attempt must store a score.

### Required quiz metrics for each user and Journey

- latest score
- best score
- attempts count
- average score

## Ranking

- Ranking must start with ranking by Classroom + Journey.

## Acceptance Criteria

Point 1 is considered complete when:

- The repository contains one documentation file at `docs/classroom_functional_spec.md`.
- The document defines the Classroom feature as the functional source of truth for later implementation.
- The document includes only the approved rules provided for Classroom.
- The document is written in English with clear markdown headings and bullet points.
- The document ends with this acceptance-criteria section.
