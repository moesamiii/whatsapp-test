// ===== SUPABASE LOGIN LOGIC =====
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
    msg.textContent = "Invalid email or password";
  }
}

function logout() {
  localStorage.removeItem("clinic_logged_in");
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("dashboardContent").style.display = "none";
  document.getElementById("email").value = "";
  document.getElementById("password").value = "";
}

// Auto-login if already authenticated
if (localStorage.getItem("clinic_logged_in") === "true") {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("dashboardContent").style.display = "block";
}

// ===== DASHBOARD LOGIC =====
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
  allData = await res.json();
  filterAndRender();
}

function filterAndRender() {
  const s = q("#search").value.toLowerCase();
  const d = q("#dateFilter").value;
  const service = q("#serviceFilter").value;

  let data = allData.filter(
    (b) =>
      (b.name?.toLowerCase().includes(s) ||
        b.phone?.includes(s) ||
        b.service?.toLowerCase().includes(s)) &&
      (!d || b.timestamp?.startsWith(d)) &&
      (!service || b.service === service)
  );

  renderTable(data);
  updateStats(data);
  updateAnalytics(data);
  drawCharts(data);
  populateServiceFilter();
}

function populateServiceFilter() {
  const services = [...new Set(allData.map((b) => b.service).filter(Boolean))];
  const select = q("#serviceFilter");
  const currentValue = select.value;
  select.innerHTML = '<option value="">All Services</option>';
  services.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
  select.value = currentValue;
}

function renderTable(d) {
  const tb = q("#tbl tbody");
  tb.innerHTML = "";
  d.forEach((b) => {
    const r = document.createElement("tr");
    r.innerHTML = `<td>${b.name || "-"}</td><td>${b.phone || "-"}</td><td>${
      b.service || "-"
    }</td><td>${b.appointment || "-"} </td><td>${
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

function updateAnalytics(d) {
  const uniqueDays = new Set(d.map((b) => b.timestamp?.split("T")[0])).size;
  const avg = uniqueDays > 0 ? Math.round(d.length / uniqueDays) : 0;
  q("#avgPerDay").textContent = avg;

  const hours = d
    .map((b) => (b.timestamp ? new Date(b.timestamp).getHours() : null))
    .filter((h) => h !== null);
  if (hours.length > 0) {
    const hourCounts = {};
    hours.forEach((h) => (hourCounts[h] = (hourCounts[h] || 0) + 1));
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    q("#peakHour").textContent = peakHour ? `${peakHour[0]}:00` : "-";
  } else q("#peakHour").textContent = "-";

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekCount = d.filter((b) => {
    if (!b.timestamp) return false;
    const date = new Date(b.timestamp);
    return date >= weekAgo && date <= now;
  }).length;
  q("#thisWeek").textContent = weekCount;
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
          backgroundColor: "rgba(6, 208, 1, 0.8)",
          borderColor: "#06D001",
          borderWidth: 2,
          borderRadius: 8,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true }, x: { grid: { display: false } } },
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
            "#06D001",
            "#05a001",
            "#04d9d9",
            "#fbbf24",
            "#f472b6",
            "#8b5cf6",
          ],
          borderWidth: 0,
        },
      ],
    },
    options: { plugins: { legend: { position: "bottom" } }, cutout: "65%" },
  });

  const weekData = getWeeklyData(d);
  line = new Chart(q("#line"), {
    type: "line",
    data: {
      labels: weekData.labels,
      datasets: [
        {
          label: "Bookings",
          data: weekData.values,
          borderColor: "#06D001",
          backgroundColor: "rgba(6, 208, 1, 0.1)",
          tension: 0.4,
          fill: true,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: "#06D001",
        },
      ],
    },
    options: { plugins: { legend: { display: false } } },
  });
}

function getWeeklyData(d) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
  rows.sort((a, b) => {
    const aVal = a.cells[col].textContent;
    const bVal = b.cells[col].textContent;
    return sortDirection * aVal.localeCompare(bVal);
  });
  sortDirection *= -1;
  tb.innerHTML = "";
  rows.forEach((r) => tb.appendChild(r));
}

function downloadCSV() {
  fetch("/api/bookings")
    .then((r) => r.json())
    .then((d) => {
      const csv = [
        "Name,Phone,Service,Appointment,Time",
        ...d.map(
          (b) =>
            `${b.name},${b.phone},${b.service},${b.appointment},${b.timestamp}`
        ),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `clinic-bookings-${
        new Date().toISOString().split("T")[0]
      }.csv`;
      a.click();
    });
}

// Auto-refresh if logged in
if (localStorage.getItem("clinic_logged_in") === "true") {
  setInterval(load, 15000);
}
