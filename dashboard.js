// ======= SUPABASE LOGIN LOGIC =======
const SUPABASE_URL = "https://ylsbmxedhycjqaorjkvm.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsc2JteGVkaHljanFhb3Jqa3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MTk5NTUsImV4cCI6MjA3NjM5NTk1NX0.W61xOww2neu6RA4yCJUob66p4OfYcgLSVw3m3yttz1E";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  const { data } = await supabase
    .from("admin_auth")
    .select("*")
    .eq("email", email)
    .eq("password", password)
    .maybeSingle();

  if (data) {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("dashboardContent").style.display = "block";
    localStorage.setItem("clinic_logged_in", "true");
    load();
  } else {
    const msg = document.getElementById("errorMsg");
    msg.style.display = "block";
    msg.textContent = "بريد إلكتروني أو كلمة مرور غير صالحة";
  }
}

function logout() {
  localStorage.removeItem("clinic_logged_in");
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("dashboardContent").style.display = "none";
  document.getElementById("email").value = "";
  document.getElementById("password").value = "";
}

if (localStorage.getItem("clinic_logged_in") === "true") {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("dashboardContent").style.display = "block";
}

// ======= DASHBOARD LOGIC =======
let bar, pie, line;
let allData = [];
let sortDirection = 1;
const q = (s) => document.querySelector(s);
const animateNum = (el, to) => {
  let n = 0;
  const s = to / 40;
  const i = setInterval(() => {
    n += s;
    el.textContent = Math.min(Math.round(n), to);
    if (n >= to) clearInterval(i);
  }, 15);
};

async function load() {
  const res = await fetch("/api/bookings");
  const rawData = await res.json();
  // Filter out the first row (header)
  allData = rawData.slice(1); // Skip first element
  filterAndRender();
}

function filterAndRender() {
  renderTable(allData);
  updateStats(allData);
  drawCharts(allData);
}

function renderTable(d) {
  const tb = q("#tbl tbody");
  tb.innerHTML = "";
  d.forEach((b) => {
    const r = document.createElement("tr");
    r.innerHTML = `<td>${b.name || "-"}</td><td>${b.phone || "-"}</td><td>${
      b.service || "-"
    }</td><td>${b.appointment || "-"}</td><td>${
      b.timestamp ? new Date(b.timestamp).toLocaleString() : "-"
    }</td>`;
    tb.appendChild(r);
  });
}

function updateStats(d) {
  animateNum(q("#total"), d.length);
  const today = new Date().toISOString().split("T")[0];
  const todayCount = d.filter((b) => b.timestamp?.startsWith(today)).length;
  animateNum(q("#today"), todayCount);

  const sc = {};
  d.forEach((b) => b.service && (sc[b.service] = (sc[b.service] || 0) + 1));
  const top = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
  q("#popular").textContent = top ? top[0] : "N/A";

  const revenue = todayCount * 75;
  q("#revenue").textContent = "$" + revenue;
}

function drawCharts(d) {
  const sc = {};
  d.forEach((b) => (sc[b.service] = (sc[b.service] || 0) + 1));
  const labels = Object.keys(sc);
  const vals = Object.values(sc);

  if (bar) bar.destroy();
  if (pie) pie.destroy();
  if (line) line.destroy();

  bar = new Chart(q("#bar"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: vals,
          backgroundColor: "rgba(217, 70, 239, 0.8)",
          borderRadius: 8,
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: "rgba(0,0,0,0.05)",
          },
        },
        x: {
          grid: { display: false },
        },
      },
    },
  });

  pie = new Chart(q("#pie"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: vals,
          backgroundColor: [
            "#d946ef",
            "#a855f7",
            "#ec4899",
            "#f97316",
            "#3b82f6",
          ],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            padding: 20,
            font: {
              family: "'Cairo', sans-serif",
            },
          },
        },
      },
      cutout: "70%",
    },
  });

  const weekData = getWeeklyData(d);
  line = new Chart(q("#line"), {
    type: "line",
    data: {
      labels: weekData.labels,
      datasets: [
        {
          label: "الحجوزات",
          data: weekData.values,
          borderColor: "#d946ef",
          backgroundColor: "rgba(217, 70, 239, 0.1)",
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: "#d946ef",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: "rgba(0,0,0,0.05)",
          },
        },
        x: {
          grid: { display: false },
        },
      },
    },
  });
}

function getWeeklyData(d) {
  const days = [
    "الأحد",
    "الاثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
  ];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  d.forEach((b) => {
    if (b.timestamp) {
      const day = new Date(b.timestamp).getDay();
      counts[day]++;
    }
  });
  return { labels: days, values: counts };
}

function sortTable(col) {
  const tb = q("#tbl tbody");
  const rows = Array.from(tb.rows);
  rows.sort(
    (a, b) =>
      sortDirection *
      a.cells[col].textContent.localeCompare(b.cells[col].textContent)
  );
  sortDirection *= -1;
  tb.innerHTML = "";
  rows.forEach((r) => tb.appendChild(r));
}

// Theme toggle
const themeToggle = document.getElementById("themeToggle");
themeToggle.addEventListener("click", function () {
  document.body.classList.toggle("dark");
  const icon = themeToggle.querySelector("i");
  if (document.body.classList.contains("dark")) {
    icon.classList.remove("fa-moon");
    icon.classList.add("fa-sun");
    localStorage.setItem("clinic_theme", "dark");
  } else {
    icon.classList.remove("fa-sun");
    icon.classList.add("fa-moon");
    localStorage.setItem("clinic_theme", "light");
  }
});

// Check for saved theme preference
if (localStorage.getItem("clinic_theme") === "dark") {
  document.body.classList.add("dark");
  const icon = themeToggle.querySelector("i");
  icon.classList.remove("fa-moon");
  icon.classList.add("fa-sun");
}

// Sidebar toggle
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
menuToggle.addEventListener("click", () => {
  sidebar.classList.toggle("active");
});

// Close sidebar when clicking outside on mobile
document.addEventListener("click", (e) => {
  if (
    window.innerWidth <= 768 &&
    sidebar.classList.contains("active") &&
    !sidebar.contains(e.target) &&
    e.target !== menuToggle &&
    !menuToggle.contains(e.target)
  ) {
    sidebar.classList.remove("active");
  }
});

// Auto-refresh if logged in
if (localStorage.getItem("clinic_logged_in") === "true") {
  load();
  setInterval(load, 15000);
}
