import { useState, useEffect, useRef } from "react";
import "./App.css";

const apiRequest = (path, options = {}) => fetch(`http://localhost:5000/api${path}`, {
  ...options,
  credentials: "include",
});

const getLocalDateKey = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");

function App() {
  const [authStatus, setAuthStatus] = useState("checking");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", phoneNumber: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [medicine, setMedicine] = useState("");
  const [time, setTime] = useState("");
  const [dosage, setDosage] = useState("1 tablet");
  const [notes, setNotes] = useState("");
  const [medicines, setMedicines] = useState([]);
  const [medicineSearch, setMedicineSearch] = useState("");
  const [medicineStatusFilter, setMedicineStatusFilter] = useState("all");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => new Date());
  const [reports, setReports] = useState([]);
  const [reportFile, setReportFile] = useState(null);
  const [reportError, setReportError] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const lastTriggeredReminderRef = useRef({});

  // Medicine reminder status
  const [reminderStatus, setReminderStatus] = useState({});

  // Patient profile
  const [patientName, setPatientName] = useState("Patient");
  const [patientAge, setPatientAge] = useState("");
  const [patientContact, setPatientContact] = useState("");
  const [familyContact, setFamilyContact] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [profileReadyForEditing, setProfileReadyForEditing] = useState(false);

  const calendarOffset = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    1
  ).getDay();
  const calendarDaysInMonth = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() + 1,
    0
  ).getDate();
  const calendarCellCount = Math.ceil((calendarOffset + calendarDaysInMonth) / 7) * 7;
  const calendarDays = Array.from({ length: calendarCellCount }, (_, index) =>
    new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      index - calendarOffset + 1
    )
  );
  const todayDateKey = getLocalDateKey(new Date());
  const selectedDateKey = getLocalDateKey(selectedCalendarDate);
  const selectedDateIsFutureOrToday = selectedDateKey >= todayDateKey;
  const selectedDayMedicines = selectedDateIsFutureOrToday
    ? [...medicines].sort((first, second) => first.time.localeCompare(second.time))
    : [];

  const shiftCalendarMonth = (offset) => {
    const nextMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + offset,
      1
    );
    setCalendarMonth(nextMonth);
    setSelectedCalendarDate(nextMonth);
  };

  const selectCalendarDate = (date) => {
    setSelectedCalendarDate(date);
    if (
      date.getMonth() !== calendarMonth.getMonth() ||
      date.getFullYear() !== calendarMonth.getFullYear()
    ) {
      setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  const selectToday = () => {
    const today = new Date();
    setSelectedCalendarDate(today);
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const filteredMedicines = medicines.filter((item) => {
    const searchText = medicineSearch.trim().toLocaleLowerCase();
    const matchesSearch = [item.name, item.time, item.dosage, item.notes]
      .some((value) => String(value || "").toLocaleLowerCase().includes(searchText));
    const status = reminderStatus[item._id] || "pending";

    return matchesSearch &&
      (medicineStatusFilter === "all" || status === medicineStatusFilter);
  });

  const emergencyContacts = [
    {
      id: 1,
      label: "Emergency Services",
      number: "112",
      detail: "India emergency response",
      icon: "🚑",
    },
    {
      id: 2,
      label: "Primary Care Clinic",
      number: "+91 98765 43210",
      detail: "Doctor on call support",
      icon: "🏥",
    },
    {
      id: 3,
      label: "Mumbai Hospital Emergency",
      number: "+91 22 2666 0000",
      detail: "Local emergency hospital support",
      icon: "🏨",
    },
    {
      id: 4,
      label: "Family Contact",
      number: familyContact,
      detail: familyContact
        ? "Trusted family member"
        : "Add a family contact number in Patient Profile",
      icon: "👨‍👩‍👧",
    },
  ];

  const emergencyHistory = [
    {
      id: 1,
      title: "Check-up Follow-up",
      date: "2026-09-12",
      detail: "Reviewed blood pressure and medicine schedule after medication changes.",
    },
    {
      id: 2,
      title: "Medication Review",
      date: "2026-08-25",
      detail: "Updated dose timing and confirmed medicine adherence tracking.",
    },
    {
      id: 3,
      title: "Emergency Preparedness",
      date: "2026-08-08",
      detail: "Saved emergency contact plan and verified all support contacts.",
    },
  ];

  const [dispenserState, setDispenserState] = useState({
    battery: 88,
    status: "Connected",
    nextDose: "08:30 AM",
    inventory: 24,
    lastDispense: "No dispense yet",
  });

  const loadReports = async () => {
    const response = await apiRequest("/reports");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Could not load reports.");
    }
    setReports(data.reports || []);
  };

  useEffect(() => {
    let isActive = true;

    const restoreSession = async () => {
      try {
        const response = await apiRequest("/auth/me");
        if (!isActive) return;
        if (!response.ok) {
          setAuthStatus("guest");
          return;
        }
        const data = await response.json();
        setCurrentUser(data.user);
        setAuthStatus("authenticated");
      } catch {
        if (isActive) setAuthStatus("guest");
      }
    };

    restoreSession();
    return () => {
      isActive = false;
    };
  }, []);

  // =========================
  // LOAD MEDICINES
  // =========================
  useEffect(() => {
    if (authStatus !== "authenticated") return;

    const loadMedicines = async () => {
      try {
        const response = await apiRequest("/medicines");
        if (!response.ok) throw new Error("Could not load medicines.");
        const data = await response.json();
        setMedicines(data);
      } catch (error) {
        console.error("Error loading medicines:", error);
      }
    };

    loadMedicines();
    loadReports().catch((error) => setReportError(error.message));
  }, [authStatus]);

  // =========================
  // MEDICINE REMINDER
  // =========================
  useEffect(() => {
    if (authStatus !== "authenticated") return;

    if (
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission();
    }

    const interval = setInterval(() => {
      const now = new Date();

      const currentTime = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      medicines.forEach((item) => {
        if (item.time === currentTime) {
          showMedicineReminder(item._id, item.name);
        }
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [medicines, authStatus]);

  // =========================
  // SHOW REMINDER
  // =========================
  const playReminderSound = () => {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) {
        return;
      }

      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = 880;

      gainNode.gain.value = 0.08;
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.35);

      setTimeout(() => {
        if (audioContext.state !== "closed") {
          audioContext.close();
        }
      }, 500);
    } catch (error) {
      console.warn("Reminder sound could not be played:", error);
    }
  };

  const showMedicineReminder = (medicineId, medicineName) => {
    const reminderKey = `${medicineId}-${new Date().toDateString()}`;

    if (lastTriggeredReminderRef.current[reminderKey]) {
      return;
    }

    lastTriggeredReminderRef.current[reminderKey] = true;
    playReminderSound();

    if (
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification("💊 Medicine Reminder", {
        body: `It's time to take ${medicineName}.`,
      });
    }

    alert(
      `💊 Medicine Reminder\n\nIt's time to take ${medicineName}!`
    );
  };

  // =========================
  // ADD MEDICINE
  // =========================
  const addMedicine = async () => {
    if (!medicine || !time) {
      alert("Please enter medicine name and time.");
      return;
    }

    try {
      const response = await apiRequest(
        "/medicines",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: medicine,
            time: time,
            dosage,
            notes,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setMedicines((prevMedicines) => [...prevMedicines, data.medicine]);

        setMedicine("");
        setTime("");
        setDosage("1 tablet");
        setNotes("");

        alert("Medicine saved successfully!");
      } else {
        alert("Failed to save medicine.");
        console.log(data);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Cannot connect to backend.");
    }
  };

  // =========================
  // DELETE MEDICINE
  // =========================
  const deleteMedicine = async (id) => {
    try {
      const response = await apiRequest(
        `/medicines/${id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (response.ok) {
        setMedicines((prevMedicines) =>
          prevMedicines.filter((item) => item._id !== id)
        );

        setReminderStatus((prevStatus) => {
          const nextStatus = { ...prevStatus };
          delete nextStatus[id];
          return nextStatus;
        });

        alert("Medicine deleted successfully!");
      } else {
        alert("Failed to delete medicine.");
        console.log(data);
      }
    } catch (error) {
      console.error(
        "Error deleting medicine:",
        error
      );

      alert("Cannot connect to backend.");
    }
  };

  // =========================
  // EDIT MEDICINE
  // =========================
  const editMedicine = async (
    id,
    currentName,
    currentTime,
    currentDosage,
    currentNotes
  ) => {
    const newName = prompt(
      "Enter new medicine name:",
      currentName
    );

    if (newName === null) {
      return;
    }

    const newTime = prompt(
      "Enter new reminder time (HH:MM):",
      currentTime
    );

    if (newTime === null) {
      return;
    }

    const newDosage = prompt(
      "Enter dosage:",
      currentDosage || "1 tablet"
    );

    if (newDosage === null) {
      return;
    }

    const newNotes = prompt(
      "Enter notes (optional):",
      currentNotes || ""
    );

    if (newNotes === null) {
      return;
    }

    if (!newName || !newTime || !newDosage.trim()) {
      alert(
        "Medicine name, time, and dosage cannot be empty."
      );
      return;
    }

    try {
      const response = await apiRequest(
        `/medicines/${id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: newName,
            time: newTime,
            dosage: newDosage,
            notes: newNotes,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setMedicines((prevMedicines) =>
          prevMedicines.map((item) =>
            item._id === id ? data.medicine : item
          )
        );

        alert("Medicine updated successfully!");
      } else {
        alert("Failed to update medicine.");
        console.log(data);
      }
    } catch (error) {
      console.error(
        "Error updating medicine:",
        error
      );

      alert("Cannot connect to backend.");
    }
  };

  // =========================
  // MARK MEDICINE AS TAKEN
  // =========================
  const markMedicineTaken = (id) => {
    setReminderStatus((prevStatus) => ({
      ...prevStatus,
      [id]: "taken",
    }));
  };

  // =========================
  // MARK MEDICINE AS SKIPPED
  // =========================
  const markMedicineSkipped = (id) => {
    setReminderStatus((prevStatus) => ({
      ...prevStatus,
      [id]: "skipped",
    }));
  };

  const loadPatientProfile = async ({ showFeedback = true } = {}) => {
    try {
      const response = await apiRequest("/patient");

      if (!response.ok) {
        throw new Error("Failed to load patient profile.");
      }

      const data = await response.json();

      if (data.patient) {
        setPatientName(data.patient.name);
        setPatientAge(data.patient.age);
        setPatientContact(data.patient.contact);
        setFamilyContact(data.patient.familyContact || "");
      } else {
        setPatientName("Patient");
        setPatientAge("");
        setPatientContact("");
        setFamilyContact("");
        if (showFeedback) {
          alert("No saved patient profile found.");
        }
      }

      setProfileReadyForEditing(true);
      setIsEditing(false);
    } catch (error) {
      console.error("Error loading patient profile:", error);
      if (showFeedback) {
        alert("Could not load the saved patient profile.");
      }
    }
  };

  useEffect(() => {
    if (authStatus !== "authenticated") return;

    loadPatientProfile({ showFeedback: false });
  }, [authStatus]);

  // =========================
  // SAVE PATIENT PROFILE
  // =========================
  const savePatientProfile = async () => {
    if (!patientName.trim() || !patientAge || !patientContact.trim()) {
      alert("Enter the patient name, age, and contact number before saving.");
      return;
    }

    try {
      const response = await apiRequest(
        "/patient",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: patientName,
            age: patientAge,
            contact: patientContact,
            familyContact,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        alert(
          "Patient profile saved successfully!"
        );

        setIsEditing(false);
      } else {
        alert(
          "Failed to save patient profile."
        );

        console.log(data);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Cannot connect to backend.");
    }
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError("");

    try {
      const endpoint = authMode === "register" ? "/auth/register" : "/auth/login";
      const response = await apiRequest(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to authenticate.");
      }

      setCurrentUser(data.user);
      setAuthStatus("authenticated");
      setAuthForm({ name: "", phoneNumber: "", password: "" });
    } catch (error) {
      setAuthError(error.message || "Unable to connect to the account service.");
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } finally {
      setCurrentUser(null);
      setMedicines([]);
      setReports([]);
      setReminderStatus({});
      setPatientName("Patient");
      setPatientAge("");
      setPatientContact("");
      setFamilyContact("");
      setProfileReadyForEditing(false);
      setIsEditing(false);
      setAuthStatus("guest");
    }
  };

  const uploadMedicalReport = async (event) => {
    event.preventDefault();
    if (!reportFile) {
      setReportError("Choose a report file to upload.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData();
    formData.append("report", reportFile);
    setReportBusy(true);
    setReportError("");

    try {
      const response = await apiRequest("/reports", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Could not upload the report.");
      }

      await loadReports();
      setReportFile(null);
      form.reset();
    } catch (error) {
      setReportError(error.message || "Could not upload the report.");
    } finally {
      setReportBusy(false);
    }
  };

  const deleteMedicalReport = async (id) => {
    if (!window.confirm("Delete this medical report? This cannot be undone.")) return;

    try {
      const response = await apiRequest(`/reports/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not delete the report.");
      setReports((previousReports) => previousReports.filter((report) => report._id !== id));
    } catch (error) {
      setReportError(error.message || "Could not delete the report.");
    }
  };

  const dispenseNow = () => {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    setDispenserState((prev) => ({
      ...prev,
      battery: Math.max(30, prev.battery - 2),
      inventory: Math.max(0, prev.inventory - 1),
      lastDispense: `Dispensed at ${timeLabel}`,
      status: "Dispensing",
      nextDose: "Next: 8:30 AM",
    }));

    alert("Smart medicine dispenser release started successfully.");
  };

  if (authStatus === "checking") {
    return (
      <main className="auth-shell">
        <div className="auth-panel auth-loading">Checking your account session...</div>
      </main>
    );
  }

  if (authStatus !== "authenticated") {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="auth-brand-mark">💊</div>
          <h1>{authMode === "register" ? "Create your account" : "Welcome back"}</h1>
          <p className="auth-intro">
            Keep your medicine schedule and medical reports in your own secure account.
          </p>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === "register" && (
              <label>
                Full name
                <input
                  type="text"
                  autoComplete="name"
                  minLength="2"
                  maxLength="80"
                  required
                  value={authForm.name}
                  onChange={(event) => setAuthForm((previous) => ({ ...previous, name: event.target.value }))}
                />
              </label>
            )}
            <label>
              Phone number
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength="24"
                placeholder="+91 98765 43210"
                required
                value={authForm.phoneNumber}
                onChange={(event) => setAuthForm((previous) => ({ ...previous, phoneNumber: event.target.value }))}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={authMode === "register" ? "new-password" : "current-password"}
                minLength={authMode === "register" ? 10 : undefined}
                maxLength="128"
                required
                value={authForm.password}
                onChange={(event) => setAuthForm((previous) => ({ ...previous, password: event.target.value }))}
              />
            </label>
            {authError && <p className="auth-error" role="alert">{authError}</p>}
            <button className="auth-submit" type="submit">
              {authMode === "register" ? "Create account" : "Sign in"}
            </button>
          </form>

          <button
            className="auth-switch"
            type="button"
            onClick={() => {
              setAuthMode((mode) => mode === "login" ? "register" : "login");
              setAuthError("");
            }}
          >
            {authMode === "register" ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
          <p className="auth-privacy">Your account keeps your records separate from other patients.</p>
        </section>
      </main>
    );
  }

  return (
    <div className="app">

      {/* =========================
          HEADER
      ========================= */}
      <header className="header">

        <div className="logo">
          💊 <span>Medicine Help Portal</span>
        </div>

        <nav>
          <a href="#home">Home</a>
          <a href="#dashboard">Dashboard</a>
          <a href="#calendar">Calendar</a>
          <a href="#medicines">Medicines</a>
          <a href="#reminders">Reminders</a>
          <a href="#reports">Reports</a>
          <a href="#emergency">Emergency</a>
          <a href="#about">About</a>
        </nav>

        <div className="header-account">
          <span>{currentUser?.name}</span>
          <button type="button" onClick={handleLogout}>Sign out</button>
        </div>

      </header>

      {/* =========================
          PATIENT DASHBOARD
      ========================= */}
      <section
        className="dashboard"
        id="dashboard"
      >

        <div className="dashboard-container">

          <h2 className="dashboard-title">
            Health Is Wealth
          </h2>

          <div className="patient-box">

            <div className="profile-header">

              <h3>
                👤 Patient Profile
              </h3>

              <div className="profile-actions">
                <button
                  type="button"
                  className="edit-button profile-load-button"
                  onClick={loadPatientProfile}
                >
                  Load Saved Profile
                </button>

                <button
                  type="button"
                  className="edit-button"
                  onClick={() => {
                    if (isEditing) {
                      savePatientProfile();
                    } else if (!profileReadyForEditing) {
                      alert("Load the saved profile before editing.");
                    } else {
                      setIsEditing(true);
                    }
                  }}
                >
                  {isEditing ? "Save" : "Edit"}
                </button>
              </div>

            </div>

            <label>
              Patient Name
            </label>

            <input
              type="text"
              value={patientName}
              onChange={(e) =>
                setPatientName(e.target.value)
              }
              placeholder="Enter patient name"
              disabled={!isEditing}
            />

            <label>
              Age
            </label>

            <input
              type="number"
              value={patientAge}
              onChange={(e) =>
                setPatientAge(e.target.value)
              }
              placeholder="Enter age"
              disabled={!isEditing}
            />

            <label>
              Contact Number
            </label>

            <input
              type="tel"
              value={patientContact}
              onChange={(e) =>
                setPatientContact(e.target.value)
              }
              placeholder="Enter contact number"
              disabled={!isEditing}
            />

            <label>
              Family Contact Number
            </label>

            <input
              type="tel"
              value={familyContact}
              onChange={(e) =>
                setFamilyContact(e.target.value)
              }
              placeholder="Enter family contact number"
              disabled={!isEditing}
            />

          </div>

          <div className="dashboard-cards">

            <div className="dashboard-card">

              <div className="dashboard-icon">
                💊
              </div>

              <h3>
                Total Medicines
              </h3>

              <strong>
                {medicines.length}
              </strong>

            </div>

            <div className="dashboard-card">

              <div className="dashboard-icon">
                ⏰
              </div>

              <h3>
                Today's Reminders
              </h3>

              <strong>
                {medicines.length}
              </strong>

            </div>

            <div className="dashboard-card">

              <div className="dashboard-icon">
                🔔
              </div>

              <h3>
                Active Reminders
              </h3>

              <strong>
                {medicines.length}
              </strong>

            </div>

          </div>

        </div>

      </section>

      {/* =========================
          HERO
      ========================= */}
      <section
        className="hero"
        id="home"
      >

        <div className="hero-content">

          <h1>
            Your Health,
            <br />
            <span>Our Priority</span>
          </h1>

          <p>
            Manage your medicines, set reminders,
            and never miss an important dose.
          </p>

          <a
            href="#reminders"
            className="hero-button"
          >
            Set Medicine Reminder
          </a>

        </div>

        <div className="hero-icon">
          💊
        </div>

      </section>

      <section className="smart-summary">
        <div className="summary-card summary-primary">
          <span className="summary-label">Care Score</span>
          <strong>92%</strong>
          <small>Excellent medication compliance</small>
        </div>
        <div className="summary-card">
          <span className="summary-label">Next Dose</span>
          <strong>{medicines[0]?.time || "08:30"}</strong>
          <small>{medicines[0]?.name || "No medicine scheduled"}</small>
        </div>
        <div className="summary-card">
          <span className="summary-label">Emergency Readiness</span>
          <strong>Ready</strong>
          <small>Contacts and plan saved</small>
        </div>
      </section>

      <section className="calendar-section" id="calendar">
        <div className="calendar-section-header">
          <div>
            <span className="eyebrow">Medicine schedule</span>
            <h2>Calendar</h2>
          </div>
          <p>Current reminders repeat daily.</p>
        </div>

        <div className="calendar-layout">
          <div className="calendar-month-panel">
            <div className="calendar-toolbar">
              <h3>
                {calendarMonth.toLocaleDateString([], { month: "long", year: "numeric" })}
              </h3>
              <div className="calendar-controls">
                <button type="button" aria-label="Previous month" title="Previous month" onClick={() => shiftCalendarMonth(-1)}>
                  ‹
                </button>
                <button type="button" className="calendar-today-button" onClick={selectToday}>
                  Today
                </button>
                <button type="button" aria-label="Next month" title="Next month" onClick={() => shiftCalendarMonth(1)}>
                  ›
                </button>
              </div>
            </div>

            <div className="calendar-grid calendar-weekdays" aria-hidden="true">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="calendar-grid calendar-dates">
              {calendarDays.map((date) => {
                const dateKey = getLocalDateKey(date);
                const isCurrentMonth = date.getMonth() === calendarMonth.getMonth();
                const isToday = dateKey === todayDateKey;
                const isSelected = dateKey === selectedDateKey;
                const hasDoses = medicines.length > 0 && dateKey >= todayDateKey;

                return (
                  <button
                    key={dateKey}
                    type="button"
                    className={`calendar-day${isCurrentMonth ? "" : " outside-month"}${isToday ? " today" : ""}${isSelected ? " selected" : ""}`}
                    aria-label={`${date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${hasDoses ? `, ${medicines.length} scheduled ${medicines.length === 1 ? "dose" : "doses"}` : ""}`}
                    aria-pressed={isSelected}
                    onClick={() => selectCalendarDate(date)}
                  >
                    <span className="calendar-day-number">{date.getDate()}</span>
                    {hasDoses && (
                      <span className="calendar-dose-marker">
                        {medicines.length} {medicines.length === 1 ? "dose" : "doses"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="calendar-day-panel" aria-live="polite">
            <span className="calendar-day-label">Selected day</span>
            <h3>
              {selectedCalendarDate.toLocaleDateString([], {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h3>

            {!selectedDateIsFutureOrToday ? (
              <p className="calendar-empty">Past dose history is not available yet.</p>
            ) : selectedDayMedicines.length === 0 ? (
              <p className="calendar-empty">No medicine reminders scheduled.</p>
            ) : (
              <ol className="calendar-dose-list">
                {selectedDayMedicines.map((item) => (
                  <li key={item._id}>
                    <time>{item.time}</time>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.dosage || "1 tablet"}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      </section>

      {/* =========================
          FEATURES
      ========================= */}
      <section className="features">

        <div className="feature-card">

          <div className="feature-icon">
            ⏰
          </div>

          <h3>
            Medicine Reminders
          </h3>

          <p>
            Set reminders for your medicines
            and dosage times.
          </p>

        </div>

        <div className="feature-card">

          <div className="feature-icon">
            🔔
          </div>

          <h3>
            Notifications
          </h3>

          <p>
            Get notified when it is time
            to take your medicine.
          </p>

        </div>

        <div className="feature-card">

          <div className="feature-icon">
            📋
          </div>

          <h3>
            Medicine Management
          </h3>

          <p>
            Keep your medicine schedule
            organized in one place.
          </p>

        </div>

      </section>

      {/* =========================
          ADD MEDICINE
      ========================= */}
      <section
        className="reminder-section"
        id="reminders"
      >

        <div className="reminder-container">

          <h2>
            💊 Add Medicine Reminder
          </h2>

          <p className="section-description">
            Add your medicine and the time
            you need to take it.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              addMedicine();
            }}
            className="medicine-form"
          >

            <div className="input-group">

              <label>
                Medicine Name
              </label>

              <input
                type="text"
                placeholder="e.g. Paracetamol"
                value={medicine}
                onChange={(e) =>
                  setMedicine(e.target.value)
                }
              />

            </div>

            <div className="input-group">

              <label>
                Reminder Time
              </label>

              <input
                type="time"
                value={time}
                onChange={(e) =>
                  setTime(e.target.value)
                }
              />

            </div>

            <div className="input-group">

              <label>
                Dosage
              </label>

              <input
                type="text"
                placeholder="e.g. 1 tablet"
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
              />

            </div>

            <div className="input-group">

              <label>
                Notes (optional)
              </label>

              <textarea
                rows="2"
                placeholder="e.g. Take after food"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

            </div>

            <button type="submit">
              + Add Reminder
            </button>

          </form>

        </div>

      </section>

      {/* =========================
          MEDICINE LIST
      ========================= */}
      <section
        className="medicine-section"
        id="medicines"
      >

        <h2>
          📋 My Medicine Schedule
        </h2>

        {medicines.length === 0 ? (

          <div className="empty">

            <div>
              💊
            </div>

            <p>
              No medicines added yet.
            </p>

            <span>
              Add a medicine reminder above.
            </span>

          </div>

        ) : (

          <>
          <div className="medicine-filters">
            <label className="medicine-search">
              <span>Find a medicine</span>
              <input
                type="search"
                value={medicineSearch}
                onChange={(event) => setMedicineSearch(event.target.value)}
                placeholder="Search name, time, dosage, or notes"
              />
            </label>

            <div className="medicine-status-filters" role="group" aria-label="Filter medicines by status">
              {[
                { value: "all", label: "All" },
                { value: "pending", label: "Pending" },
                { value: "taken", label: "Taken" },
                { value: "skipped", label: "Skipped" },
              ].map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={medicineStatusFilter === filter.value ? "active" : ""}
                  aria-pressed={medicineStatusFilter === filter.value}
                  onClick={() => setMedicineStatusFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {filteredMedicines.length === 0 ? (
            <div className="empty medicine-no-results">
              <p>No matching medicines found.</p>
              <button
                type="button"
                onClick={() => {
                  setMedicineSearch("");
                  setMedicineStatusFilter("all");
                }}
              >
                Clear search and filters
              </button>
            </div>
          ) : (
          <div className="medicine-list">

            {filteredMedicines.map((item) => (

              <div
                className="medicine-card"
                key={item._id}
              >

                <div>

                  <h3>
                    💊 {item.name}
                  </h3>

                  <p>
                    ⏰ Reminder: {item.time}
                  </p>

                  <p>
                    Dosage: {item.dosage || "1 tablet"}
                  </p>

                  {item.notes && <p>Notes: {item.notes}</p>}

                  <p>
                    Status:{" "}

                    {reminderStatus[item._id] ===
                    "taken"
                      ? "✅ Taken"
                      : reminderStatus[item._id] ===
                        "skipped"
                      ? "⏭️ Skipped"
                      : "⏰ Pending"}
                  </p>

                </div>

                <div>

                  <button
                    onClick={() =>
                      editMedicine(
                        item._id,
                        item.name,
                        item.time,
                        item.dosage,
                        item.notes
                      )
                    }
                  >
                    Edit
                  </button>

                  <button
                    onClick={() =>
                      deleteMedicine(item._id)
                    }
                  >
                    Delete
                  </button>

                  <button
                    onClick={() =>
                      markMedicineTaken(item._id)
                    }
                  >
                    ✅ Taken
                  </button>

                  <button
                    onClick={() =>
                      markMedicineSkipped(item._id)
                    }
                  >
                    ⏭️ Skip
                  </button>

                </div>

              </div>

            ))}

          </div>
          )}
          </>

        )}

      </section>

      <section className="reports-section" id="reports">
        <div className="section-heading">
          <span className="eyebrow">Private files</span>
          <h2>Medical Reports</h2>
        </div>

        <div className="reports-panel">
          <form className="report-upload-form" onSubmit={uploadMedicalReport}>
            <label>
              Upload a report
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(event) => {
                  setReportFile(event.target.files?.[0] || null);
                  setReportError("");
                }}
              />
            </label>
            <span className="report-upload-hint">PDF, JPG, or PNG · maximum 10 MB</span>
            <button type="submit" disabled={!reportFile || reportBusy}>
              {reportBusy ? "Uploading..." : "Upload report"}
            </button>
          </form>

          {reportError && <p className="report-error" role="alert">{reportError}</p>}

          {reports.length === 0 ? (
            <p className="reports-empty">No reports uploaded yet.</p>
          ) : (
            <div className="report-list">
              {reports.map((report) => (
                <div className="report-row" key={report._id}>
                  <div className="report-file-icon">{report.mimeType === "application/pdf" ? "PDF" : "IMG"}</div>
                  <div className="report-details">
                    <strong>{report.originalName}</strong>
                    <span>
                      {(report.size / (1024 * 1024)).toFixed(2)} MB · {new Date(report.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <a
                    className="report-download"
                    href={`http://localhost:5000/api/reports/${report._id}/download`}
                  >
                    Download
                  </a>
                  <button type="button" className="report-delete" onClick={() => deleteMedicalReport(report._id)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="emergency-contacts-section" id="contacts">
        <div className="section-heading">
          <span className="eyebrow">Emergency Contacts</span>
          <h2>Trusted Support Network</h2>
        </div>

        <div className="contact-grid">
          {emergencyContacts.map((contact) => (
            <div className="contact-card" key={contact.id}>
              <div className="contact-icon">{contact.icon}</div>
              <h3>{contact.label}</h3>
              <p>{contact.detail}</p>
              {contact.number && (
                <a href={`tel:${contact.number.replace(/\s+/g, "")}`} className="emergency-button">
                  📞 {contact.number}
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="history-section" id="history">
        <div className="section-heading">
          <span className="eyebrow">Emergency History</span>
          <h2>Recent Care Timeline</h2>
        </div>

        <div className="history-list">
          {emergencyHistory.map((item) => (
            <div className="history-item" key={item.id}>
              <div className="history-date">{item.date}</div>
              <div className="history-content">
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="dispenser-section" id="dispenser">
        <div className="section-heading">
          <span className="eyebrow">Smart Medicine Dispenser</span>
          <h2>Connected Care Device</h2>
        </div>

        <div className="dispenser-panel">
          <div className="dispenser-device">
            <div className="device-screen">
              <span className="device-badge">Smart Dispenser</span>
              <strong>{dispenserState.status}</strong>
              <small>{dispenserState.lastDispense}</small>
            </div>
            <div className="device-icon">💊</div>
          </div>

          <div className="dispenser-stats">
            <div className="stat-box">
              <span>Battery</span>
              <strong>{dispenserState.battery}%</strong>
            </div>
            <div className="stat-box">
              <span>Inventory</span>
              <strong>{dispenserState.inventory} slots</strong>
            </div>
            <div className="stat-box">
              <span>Next Dose</span>
              <strong>{dispenserState.nextDose}</strong>
            </div>
          </div>

          <button className="dispense-button" type="button" onClick={dispenseNow}>
            Dispense Now
          </button>
        </div>
      </section>

      {/* =========================
          EMERGENCY HELP PORTAL
      ========================= */}
      <section
        className="emergency-section"
        id="emergency"
      >

        <div className="emergency-container">

          <div className="emergency-icon">
            🚨
          </div>

          <h2>
            Emergency Help Portal
          </h2>

          <p>
            If you are facing a medical emergency,
            get immediate help.
          </p>

          <div className="emergency-options">

            {/* CALL 112 */}
            <div className="emergency-card">

              <div className="emergency-card-icon">
                📞
              </div>

              <h3>
                Emergency Services
              </h3>

              <p>
                Call India's emergency
                response number.
              </p>

              <a
                href="tel:112"
                className="emergency-button"
              >
                📞 Call 112
              </a>

            </div>

            {/* PATIENT CONTACT */}
            <div className="emergency-card">

              <div className="emergency-card-icon">
                👤
              </div>

              <h3>
                Patient Contact
              </h3>

              <p>
                {patientContact
                  ? `Patient Contact: ${patientContact}`
                  : "No patient contact added yet."}
              </p>

              {patientContact && (
                <a
                  href={`tel:${patientContact}`}
                  className="emergency-button"
                >
                  📞 Call Patient
                </a>
              )}

            </div>

            {/* EMERGENCY INFORMATION */}
            <div className="emergency-card">

              <div className="emergency-card-icon">
                🏥
              </div>

              <h3>
                Stay Calm: Take These Steps
              </h3>

              <ol className="emergency-steps">
                <li>Call <strong>112</strong> for urgent help.</li>
                <li>Tell the dispatcher your exact location and what is happening.</li>
                <li>Stay somewhere safe and follow the dispatcher&apos;s instructions.</li>
                <li>If someone is unconscious or having trouble breathing, say so immediately.</li>
              </ol>

            </div>

          </div>

          <div className="emergency-warning">

            <strong>
              ⚠️ Important
            </strong>

            <p>
              Take one step at a time. You do not have to handle this alone. This portal
              is not a substitute for emergency medical care; call 112 now if someone is
              in immediate danger.
            </p>

          </div>

        </div>

      </section>

      {/* =========================
          ABOUT
      ========================= */}
      <section
        className="about"
        id="about"
      >

        <h2>
          About Medicine Help Portal
        </h2>

        <p>
          Medicine Help Portal is designed
          to help patients manage their medicine
          schedules and reminders easily. Our goal
          is to make medicine management simple,
          organized, and reliable.
        </p>

      </section>

      {/* =========================
          FOOTER
      ========================= */}
      <footer>

        <p>
          © 2026 Medicine Help Portal |
          Patient Care System
        </p>

      </footer>

    </div>
  );
}

export default App;