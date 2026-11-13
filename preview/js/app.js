/*
  app.js — the BRAIN of the page.

  How it works, in four steps:
    1. Load the study's data file (JSON).
    2. Work out which reading falls on which date for the chosen meeting day.
    3. Draw the month cards, the week cards and the calendar.
    4. Re-draw whenever the person picks a different month or meeting day.
*/

const DATA_FILE = "data/romans-2026.json";
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
                     "August", "September", "October", "November", "December"];

// Everything the page needs to remember while it is open
const state = {
  study: null,        // the data file, once loaded
  meetingDay: 3,      // 0 = Sunday ... 3 = Wednesday
  month: null,        // the month being shown, e.g. "2026-11"
  calendar: {},       // date -> what happens that day, e.g. "2026-11-13" -> {...}
  meetings: []        // one entry per study week: its meeting date and lessons
};

/* ---------- Small date helpers ---------- */
// We always build dates as "local noon" so time zones can never shift a day.
function toDate(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); }
function toIso(date) { return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()); }
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function pad(n) { return String(n).padStart(2, "0"); }
function monthKey(date) { return date.getFullYear() + "-" + pad(date.getMonth() + 1); }
function shortDate(date) { return MONTH_NAMES[date.getMonth()].slice(0, 3) + " " + date.getDate(); }

/* ---------- Step 2: put every reading on its date ---------- */
function buildCalendar() {
  const study = state.study;
  const rules = study.calendarRules;
  const shift = rules.lateWeekShift.appliesTo.includes(DAY_NAMES[state.meetingDay])
    ? rules.lateWeekShift.lessonsBehind : 0;

  state.calendar = {};
  state.meetings = [];

  study.weeks.forEach(function (week, i) {
    // A study week runs Thursday -> Wednesday. Find our meeting day inside it.
    const thursday = toDate(week.weekStart);
    let meeting = thursday;
    while (meeting.getDay() !== state.meetingDay) meeting = addDays(meeting, 1);

    // Groups that are a lesson behind use the plan from an earlier week
    const plan = study.weeks[i - shift] || { study: null, discuss: [], note: null };

    // Days 1-6 are the six days just before the meeting
    if (plan.study !== null) {
      const lesson = study.lessons[plan.study];
      lesson.days.forEach(function (day) {
        const date = addDays(meeting, day.day - 7);
        state.calendar[toIso(date)] = { lesson: plan.study, ...day };
      });
    }

    // The meeting day itself
    let phrase = plan.note;
    if (!phrase && plan.discuss.length) phrase = "Group discussion";
    if (phrase) {
      state.calendar[toIso(meeting)] = { meeting: true, phrase: phrase, discuss: plan.discuss };
    }
    state.meetings.push({ date: meeting, discuss: plan.discuss, study: plan.study, note: plan.note });
  });
}

/* ---------- Step 3a: month cards ---------- */
function drawMonths() {
  const dates = Object.keys(state.calendar).sort();
  const first = toDate(dates[0]);
  const last = toDate(dates[dates.length - 1]);
  const box = document.getElementById("months");
  box.innerHTML = "";

  for (let d = new Date(first.getFullYear(), first.getMonth(), 1, 12); d <= last; d.setMonth(d.getMonth() + 1)) {
    const key = monthKey(d);
    const lessons = lessonsInMonth(key);
    const button = document.createElement("button");
    button.className = "month-card" + (key === state.month ? " selected" : "");
    button.innerHTML = "<strong>" + MONTH_NAMES[d.getMonth()] + "</strong>" +
      "<span>" + d.getFullYear() + (lessons.length ? " · Lessons " + lessons[0] + "–" + lessons[lessons.length - 1] : "") + "</span>";
    button.onclick = function () { showMonth(key); };
    box.appendChild(button);
  }
}

// Lessons whose discussion night falls in a month, e.g. "2026-11" -> [7, 8, 9]
function lessonsInMonth(key) {
  return state.meetings
    .filter(function (m) { return monthKey(m.date) === key; })
    .flatMap(function (m) { return m.discuss; });
}

/* ---------- Step 3b: week cards ---------- */
function drawWeeks() {
  const box = document.getElementById("weeks");
  box.innerHTML = "";
  state.meetings.forEach(function (m) {
    if (monthKey(m.date) !== state.month) return;
    m.discuss.forEach(function (n) {
      const lesson = state.study.lessons[n];
      const section = sectionFor(n);
      const card = document.createElement("article");
      card.className = "week-card";
      card.innerHTML =
        '<img src="' + lesson.image + '" alt="Lesson ' + n + ' photo">' +
        '<div class="week-body">' +
          '<div class="week-number">Lesson ' + n + " · Discussion " + shortDate(m.date) + "</div>" +
          "<h3>" + lesson.title + "</h3>" +
          '<p class="truth">' + lesson.truth + "</p>" +
          '<dl class="facts">' +
            "<dt>Passage</dt><dd>" + ref(lesson.passage) + "</dd>" +
            (lesson.focus ? "<dt>Focus verse</dt><dd>" + ref(lesson.focus) + "</dd>" : "") +
            "<dt>Doctrine</dt><dd>" + lesson.doctrine + "</dd>" +
          "</dl>" +
        "</div>" +
        '<div class="outline" style="background:' + section.color + '">' +
          section.title + " · " + section.passage + "</div>";
      box.appendChild(card);
    });
  });
}

// Which part of the outline of Romans a lesson belongs to
function sectionFor(n) {
  return state.study.sections.find(function (s) { return s.lessons.includes(Number(n)); });
}

/* ---------- Step 3c: the calendar grid ---------- */
function drawCalendar() {
  const box = document.getElementById("calendar");
  box.innerHTML = "";
  DAY_NAMES.forEach(function (name) {
    box.insertAdjacentHTML("beforeend", '<div class="weekday">' + name.slice(0, 3) + "</div>");
  });

  const [year, month] = state.month.split("-").map(Number);
  const first = new Date(year, month - 1, 1, 12);
  const todayIso = toIso(new Date());

  // Blank boxes before the 1st so it lands under the right weekday
  for (let i = 0; i < first.getDay(); i++) box.insertAdjacentHTML("beforeend", '<div class="day empty"></div>');

  for (let d = first; d.getMonth() === month - 1; d = addDays(d, 1)) {
    const iso = toIso(d);
    const entry = state.calendar[iso];
    const cell = document.createElement("div");
    cell.className = "day" + (iso === todayIso ? " today" : "") + (entry && entry.meeting ? " meeting" : "");
    cell.id = "day-" + iso;
    if (entry && !entry.meeting) cell.style.borderTopColor = sectionFor(entry.lesson).color;
    const html = '<div class="date">' + d.getDate() + "</div>" + dayContent(iso);
    cell.innerHTML = html;
    connectReadAll(cell);
    box.appendChild(cell);
  }
}

// What goes inside one day: phrase, passage, extra readings, Read all, then "L1 · Day 2".
// Used by both the desktop calendar and the phone's big day card.
function dayContent(iso) {
  const entry = state.calendar[iso];
  if (!entry) return "";
  let html = "";
  if (entry.meeting) {
    html += '<div class="phrase">' + entry.phrase + "</div>";
    if (entry.discuss.length) html += '<div class="marker">Lesson ' + entry.discuss.join(" & ") + "</div>";
    return html;
  }
  html += '<div class="phrase">' + entry.phrase + "</div>";
  if (entry.ref) {
    html += '<div class="passage">' + (entry.kind === "Review" ? "Review " : "") + ref(entry.ref) + "</div>";
  }
  if (entry.also.length) {
    html += '<div class="also">Also: ' + entry.also.map(ref).join(", ") + "</div>";
  }
  if (entry.ref) {
    html += '<button type="button" class="read-all" data-date="' + iso + '">Read all</button>';
  }
  html += '<div class="marker">L' + entry.lesson + " · Day " + entry.day + "</div>";
  return html;
}

function connectReadAll(element) {
  element.querySelectorAll(".read-all").forEach(function (button) {
    button.onclick = function () { openReadAll(button.dataset.date); };
  });
}

/* ---------- Phone view: pick a week, then one day at a time ---------- */
// A phone week follows the group's rhythm: Day 1 through discussion night.
function weekDates(meeting) {
  const dates = [];
  for (let i = -6; i <= 0; i++) dates.push(toIso(addDays(meeting.date, i)));
  return dates;
}

// Which week (by position in state.meetings) holds a given date
function weekIndexFor(iso) {
  const i = state.meetings.findIndex(function (m) { return weekDates(m).includes(iso); });
  if (i >= 0) return i;
  return iso < toIso(state.meetings[0].date) ? 0 : state.meetings.length - 1;
}

function selectWeek(index, dayIso) {
  index = Math.max(0, Math.min(state.meetings.length - 1, index));
  const meeting = state.meetings[index];
  state.phoneWeek = index;
  state.phoneDay = dayIso || toIso(meeting.date);
  if (monthKey(meeting.date) !== state.month) { showMonth(monthKey(meeting.date), true); return; }
  drawPhone();
}

function drawPhone() {
  const box = document.getElementById("phone");
  const meeting = state.meetings[state.phoneWeek];
  const todayIso = toIso(new Date());

  // a) Week strip: one small card per week in this month
  let strip = "";
  state.meetings.forEach(function (m, i) {
    if (monthKey(m.date) !== state.month) return;
    const n = m.discuss.length ? m.discuss[0] : m.study;
    const label = m.discuss.length ? "Lesson " + m.discuss.join(" & ") : "No discussion";
    const img = n !== null && n !== undefined ? '<img src="' + state.study.lessons[n].image + '" alt="">' : "";
    strip += '<button type="button" class="week-chip' + (i === state.phoneWeek ? " selected" : "") +
      '" data-week="' + i + '">' + img + "<span>" + label + "<br><small>" + shortDate(m.date) + "</small></span></button>";
  });

  // b) Details for the chosen week (same information as the desktop week card)
  const lessons = meeting.discuss.length ? meeting.discuss : (meeting.study !== null ? [meeting.study] : []);
  let details = meeting.note ? '<p class="note">' + meeting.note + "</p>" : "";
  lessons.forEach(function (n) {
    const lesson = state.study.lessons[n];
    const section = sectionFor(n);
    details += '<div class="phone-week">' +
      "<h3>Lesson " + n + ": " + lesson.title + "</h3>" +
      '<p class="truth">' + lesson.truth + "</p>" +
      '<p class="facts-line"><b>Passage</b> ' + ref(lesson.passage) +
      (lesson.focus ? " · <b>Focus</b> " + ref(lesson.focus) : "") +
      " · <b>Doctrine</b> " + lesson.doctrine + "</p>" +
      '<div class="outline" style="background:' + section.color + '">' + section.title + "</div></div>";
  });

  // c) Seven day buttons, then one big card for the chosen day
  let buttons = "";
  weekDates(meeting).forEach(function (iso) {
    const d = toIso(new Date()) === iso ? " today" : "";
    const entry = state.calendar[iso];
    buttons += '<button type="button" class="day-pill' + (iso === state.phoneDay ? " selected" : "") + d +
      (entry && entry.meeting ? " meeting" : "") + '" data-day="' + iso + '">' +
      DAY_NAMES[toDate(iso).getDay()].slice(0, 3) + "<b>" + toDate(iso).getDate() + "</b></button>";
  });
  const day = toDate(state.phoneDay);
  const entry = state.calendar[state.phoneDay];
  const card = '<div class="day-card' + (entry && entry.meeting ? " meeting" : "") + (state.phoneDay === todayIso ? " today" : "") + '"' +
    (entry && !entry.meeting ? ' style="border-top-color:' + sectionFor(entry.lesson).color + '"' : "") + ">" +
    '<div class="date">' + DAY_NAMES[day.getDay()] + ", " + shortDate(day) + "</div>" +
    (dayContent(state.phoneDay) || '<div class="phrase">No reading today.</div>') + "</div>";

  box.innerHTML =
    '<div class="week-strip">' + strip + "</div>" + details +
    '<div class="day-pills">' + buttons + "</div>" + card +
    '<div class="week-nav"><button type="button" data-step="-1">‹ Previous week</button>' +
    '<button type="button" data-step="1">Next week ›</button></div>';

  // Make everything clickable
  box.querySelectorAll(".week-chip").forEach(function (b) {
    b.onclick = function () { selectWeek(Number(b.dataset.week)); };
  });
  box.querySelectorAll(".day-pill").forEach(function (b) {
    b.onclick = function () { state.phoneDay = b.dataset.day; drawPhone(); };
  });
  box.querySelectorAll(".week-nav button").forEach(function (b) {
    b.onclick = function () { selectWeek(state.phoneWeek + Number(b.dataset.step)); };
  });
  connectReadAll(box);
  const chosen = box.querySelector(".week-chip.selected");
  if (chosen) chosen.scrollIntoView({ inline: "center", block: "nearest" });
  tagReferences();
}

// Swipe left or right on the day card to move one day
function setupSwipe() {
  let startX = null;
  const box = document.getElementById("phone");
  box.addEventListener("touchstart", function (e) {
    startX = e.target.closest(".day-card") ? e.touches[0].clientX : null;
  });
  box.addEventListener("touchend", function (e) {
    if (startX === null) return;
    const moved = e.changedTouches[0].clientX - startX;
    if (Math.abs(moved) < 50) return;
    const step = moved < 0 ? 1 : -1;
    const next = toIso(addDays(toDate(state.phoneDay), step));
    selectWeek(weekIndexFor(next), next);
  });
}

/* ---------- Bible references ---------- */
// We write references as plain text; RefTagger turns them into hover links.
function ref(text) { return '<span class="ref">' + text + "</span>"; }

function tagReferences() {
  if (window.refTagger && typeof window.refTagger.tag === "function") {
    window.refTagger.tag(document.body);
  }
  // Back-up plan: if RefTagger could not load, link each reference to Biblia.com (Logos, NIV 2011).
  setTimeout(function () {
    if (document.querySelector(".rtBibleRef")) return;   // RefTagger did its job
    document.querySelectorAll("span.ref").forEach(function (span) {
      const a = document.createElement("a");
      a.href = "https://biblia.com/bible/niv/" + encodeURIComponent(span.textContent.replace(/:/g, "."));
      a.target = "_blank";
      a.textContent = span.textContent;
      span.replaceWith(a);
    });
  }, 2500);
}

/* ---------- "Read all": every passage for one day in a pop-up ---------- */
function openReadAll(iso) {
  const entry = state.calendar[iso];
  const refs = [entry.ref].concat(entry.also);   // main passage first, then the extra readings
  const date = toDate(iso);

  document.getElementById("dialog-title").textContent =
    DAY_NAMES[date.getDay()] + ", " + shortDate(date) + " · Lesson " + entry.lesson + ", Day " + entry.day;
  document.getElementById("dialog-phrase").textContent = entry.phrase;
  document.getElementById("dialog-list").innerHTML =
    refs.map(function (r) { return "<li>" + ref(r) + "</li>"; }).join("");
  document.getElementById("dialog-gateway").href =
    "https://www.biblegateway.com/passage/?version=NIV&search=" + encodeURIComponent(refs.join("; "));

  const dialog = document.getElementById("reading-dialog");
  dialog.showModal();
  tagReferences();   // let RefTagger add hover pop-ups inside the dialog too
}

function setupDialog() {
  const dialog = document.getElementById("reading-dialog");
  document.getElementById("dialog-close").onclick = function () { dialog.close(); };
  // Clicking the dark area outside the box also closes it
  dialog.onclick = function (event) { if (event.target === dialog) dialog.close(); };
}

/* ---------- Step 4: showing a month, and the controls ---------- */
function showMonth(key, keepWeek) {
  state.month = key;
  if (!keepWeek) {
    // Pick today's week if it's in this month, otherwise the month's first week
    const todayWeek = weekIndexFor(toIso(new Date()));
    const inMonth = state.meetings.findIndex(function (m) { return monthKey(m.date) === key; });
    if (monthKey(state.meetings[todayWeek].date) === key) {
      state.phoneWeek = todayWeek; state.phoneDay = toIso(new Date());
    } else if (inMonth >= 0) {
      state.phoneWeek = inMonth; state.phoneDay = toIso(state.meetings[inMonth].date);
    }
  }
  document.getElementById("month-title").textContent =
    MONTH_NAMES[Number(key.slice(5)) - 1] + " " + key.slice(0, 4);
  drawMonths();
  drawWeeks();
  drawCalendar();
  drawPhone();
  tagReferences();
}

function goToToday() {
  const dates = Object.keys(state.calendar).sort();
  let target = toIso(new Date());
  if (target < dates[0]) target = dates[0];                       // before the study starts
  if (target > dates[dates.length - 1]) target = dates[dates.length - 1];  // after it ends
  state.phoneWeek = weekIndexFor(target);
  state.phoneDay = target;
  showMonth(monthKey(state.meetings[state.phoneWeek].date), true);
  const cell = document.getElementById("day-" + target);
  if (cell) cell.scrollIntoView({ behavior: "smooth", block: "center" });
}

function setupMeetingDayPicker() {
  const select = document.getElementById("meeting-day");
  DAY_NAMES.forEach(function (name, i) {
    select.insertAdjacentHTML("beforeend", '<option value="' + i + '">' + name + "</option>");
  });
  try {  // remember the person's choice in their own browser, if allowed
    const saved = localStorage.getItem("meetingDay");
    if (saved !== null) state.meetingDay = Number(saved);
  } catch (e) { /* storage not available: that's fine */ }
  select.value = state.meetingDay;
  select.onchange = function () {
    state.meetingDay = Number(select.value);
    try { localStorage.setItem("meetingDay", select.value); } catch (e) {}
    buildCalendar();
    showMonth(state.month);
  };
}

/* ---------- Step 1: start everything ---------- */
fetch(DATA_FILE)
  .then(function (response) { return response.json(); })
  .then(function (study) {
    state.study = study;
    document.getElementById("study-title").textContent = study.title;
    document.getElementById("study-subtitle").textContent = study.subtitle + " · " + study.years;
    document.getElementById("today-button").onclick = goToToday;
    setupMeetingDayPicker();
    setupDialog();
    setupSwipe();
    buildCalendar();
    goToToday();
  });
