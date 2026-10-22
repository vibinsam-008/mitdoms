# MIT Hostel Digital Outpass Management System

> **DISCLAIMER:** This application is an **independent prototype** created to demonstrate a modern digital hostel outpass and student leave workflow for **Madras Institute of Technology (MIT), Anna University, Chromepet, Chennai, Tamil Nadu, India**. It is **not** an officially authorized institutional service. All student names, register numbers, signatures, and contact numbers in the demo dataset are synthetic.

---

## 1. System Overview

The **MIT Hostel Digital Outpass Management System** replaces the traditional paper-based, handwritten hostel outpass process with a secure, responsive web application for residential inmates across MIT hostel blocks (*Marutham, Thamirabarani, Kaveri, Vaigai, Amaravathi, Bhavani, Ponni, Ganga, Kurinji, Orchid, and NRI Hostel*).

### Upgrades & Core Capabilities

1. **Premium Monochrome Visual Design (Black & White)**:
   - Modern, professional SaaS aesthetic with high accessibility contrast.
   - **Dark Mode**: Near-black backgrounds (`#09090b`), charcoal cards, crisp white text, and subtle grey borders (`#27272a`).
   - **Light Mode**: Pure white backgrounds, near-black text, and pale grey cards.
   - Header theme toggle with automatic persistence of user preferences in local storage.

2. **Authentication & Student Identity Verification**:
   - Multi-role authentication: **Student**, **Resident Counsellor (RC)**, and **Executive Warden (EW)**.
   - **Sign Up**: Collects Full Name, Authentic Register Number (unique), Branch, Course, Hostel Block, Room Number, Student Phone, Parent Phone, Guardian Name, and Password.
   - **Institutional Inmate Roster Verification**: Does NOT assume self-reported student credentials are valid. Checks credentials against the pre-approved MIT hostel inmate roster (`MOCK_ROSTER`). Inmates on the roster receive `VERIFIED` status; unlisted sign-ups remain `PENDING_VERIFICATION` until approved.
   - **Administrative Provisioning**: Prevents public registration of staff accounts (RC and EW accounts are pre-provisioned).
   - Password reset simulation and session persistence.

3. **Student Profile & Automatic Form Population**:
   - Authenticated student profiles load automatically into memory and state.
   - Clicking **"Create New Outpass"** automatically populates all 8 student identity fields (Name, Register Number, Branch, Course, Block, Room, Student Phone, Parent Phone).
   - Dedicated **"Edit My Profile"** modal for updating contact information and room changes.
   - **Historical Snapshot Integrity**: Every submitted outpass stores an immutable snapshot of the student's profile at the time of submission; later profile changes do not alter past outpasses.

4. **Multi-Role Dashboards**:
   - **Student Dashboard**: Welcome banner, verified inmate status badge, profile summary, metrics (Total, Drafts, Pending, Approved, Returned, Rejected, Cancelled), fast filtering, and action controls.
   - **Resident Counsellor (RC) Dashboard**: Block-scoped view of student requests, parent contact verification tool (`VERIFIED` / `UNABLE_TO_VERIFY`), remarks, and endorsement.
   - **Executive Warden (EW) Dashboard**: Central institutional oversight, prior endorsement review, final sanction authority, and workflow policy configuration.
   - **Main Gate Security Terminal**: Real-time QR verification with departure/arrival timestamp logging.

5. **Approval Sequences (Workflow Policies)**:
   - **Policy B (Default - Standard Institutional Policy)**: Mandatory two-tier approval. All requests require RC parent verification and recommendation followed by EW final sanction.
   - **Policy A (Duration-based)**: RC single-tier clearance for short leaves (≤ threshold days), escalating to EW for longer stays.

6. **Printable Digital Outpass Certificate**:
   - A4 certificate format with institutional seal, dynamic QR code verification payload, and triple-signature block (Student, RC, EW).
   - Tailored print CSS for 1-click PDF download or physical printing.

---

## 2. Demo User Accounts

Switch accounts easily via the navigation bar or use the **Sign In** modal:

| Role | Name | Identifier / Email | Designation / Inmate Details |
| :--- | :--- | :--- | :--- |
| **Student 1 (Verified)** | **K. Vigneshwaran** | `2022506042` / `vignesh.2022506042@annauniv.edu` | III Year B.Tech AI&DS • Marutham Rm 204 |
| **Student 2 (Verified)** | **Ananya R.** | `2023504018` / `ananya.2023504018@annauniv.edu` | II Year B.E. CSE • Thamirabarani Rm 312 |
| **Student 3 (Verified)** | **Pravin Kumar M.** | `2021503055` / `pravin.2021503055@annauniv.edu` | IV Year B.E. ECE • Kaveri Rm 108 |
| **Student 4 (Pending)** | **Sneha L.** | `2024508003` / `sneha.2024508003@annauniv.edu` | I Year B.E. Aero • Marutham Rm 102 |
| **Resident Counsellor (RC)** | **Dr. R. Manickam** | `rc.manickam@mitindia.edu` | Resident Counsellor, Dept. of Applied Sciences |
| **Executive Warden (EW)** | **Prof. Dr. S. K. Sundaramoorthy** | `ew.warden@mitindia.edu` | Executive Warden, MIT Campus Hostels |

---

## 3. End-to-End Workflow Demonstration

1. **Student Login & Application**:
   - Sign in as `K. Vigneshwaran` (or switch to Student mode).
   - Click **"Create New Outpass"** — observe that personal details are pre-filled automatically.
   - Fill in Place of Visit (*Tiruchirappalli*), Address, and Date/Time.
   - Sign using the Canvas signature pad (or click *Auto-Sign (Demo)*).
   - Check the declaration and click **"Submit Outpass for Approval"**.
2. **RC Verification & Endorsement**:
   - Switch role to **Resident Counsellor (RC)**.
   - Open the pending request in the queue.
   - Inspect student information, verify parent contact (click **"Record Parent Call: Verified"**), add remarks, and click **"Recommend & Forward to EW"**.
3. **EW Sanction**:
   - Switch role to **Executive Warden (EW)**.
   - Review prior RC recommendation and call logs.
   - Endorse with EW signature and approve the outpass.
4. **Student Downloads Pass**:
   - Switch back to **Student View**.
   - Notice the status is updated to **APPROVED**.
   - Click **"Print Pass"** to view and print the A4 certificate.
5. **Gate Security Terminal**:
   - Open **Gate Terminal** from the top banner.
   - Search the Outpass ID or click the quick selector.
   - Log campus departure and return timestamps.
