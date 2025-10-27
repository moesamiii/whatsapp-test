document.addEventListener("DOMContentLoaded", () => {
  // ======= SUPABASE LOGIN LOGIC =======
  const SUPABASE_URL = "https://ylsbmxedhycjqaorjkvm.supabase.co";
  const SUPABASE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsc2JteGVkaHljanFhb3Jqa3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MTk5NTUsImV4cCI6MjA3NjM5NTk1NX0.W61xOww2neu6RA4yCJUob66p4OfYcgLSVw3m3yttz1E";

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const loginScreen = document.getElementById("loginScreen");
  const dashboardContent = document.getElementById("dashboardContent");
  const errorMsg = document.getElementById("errorMsg");

  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  loginBtn.addEventListener("click", login);
  logoutBtn.addEventListener("click", logout);

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
      loginScreen.style.display = "none";
      dashboardContent.style.display = "block";
      localStorage.setItem("clinic_logged_in", "true");
      load();
    } else {
      errorMsg.style.display = "block";
      errorMsg.textContent = "بريد إلكتروني أو كلمة مرور غير صالحة";
    }
  }

  function logout() {
    localStorage.removeItem("clinic_logged_in");
    loginScreen.style.display = "flex";
    dashboardContent.style.display = "none";
    document.getElementById("email").value = "";
    document.getElementById("password").value = "";
  }

  if (localStorage.getItem("clinic_logged_in") === "true") {
    loginScreen.style.display = "none";
    dashboardContent.style.display = "block";
  }

  // ======= DASHBOARD LOGIC =======
  let bar, pie, line;
  let allData = [];
  let sortDirection = 1;
  const q = (s) => document.querySelector(s);

  async function load() {
    const res = await fetch("/api/bookings");
    const rawData = await res.json();
    allData = rawData.slice(1);
    renderTable(allData);
    updateStats(allData);
    drawCharts(allData);
  }

  function renderTable(d) {
    const tb = q("#tbl tbody");
    tb.innerHTML = "";
    d.forEach((b) => {
      const r = document.createElement("tr");
      r.innerHTML = `<td>${b.name || "-"}</td>
        <td>${b.phone || "-"}</td>
        <td>${b.service || "-"}</td>
        <td>${b.appointment || "-"}</td>
        <td>${b.timestamp ? new Date(b.timestamp).toLocaleString() : "-"}</td>`;
      tb.appendChild(r);
    });
  }

  function updateStats(d) {
    q("#total").textContent = d.length;
    const today = new Date().toISOString().split("T")[0];
    const todayCount = d.filter((b) => b.timestamp?.startsWith(today)).length;
    q("#today").textContent = todayCount;

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
      data: { labels, datasets: [{ data: vals, backgroundColor: "#d946ef" }] },
      options: { responsive: true, plugins: { legend: { display: false } } },
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
          },
        ],
      },
      options: { plugins: { legend: { position: "bottom" } } },
    });

    const weekData = getWeeklyData(d);
    line = new Chart(q("#line"), {
      type: "line",
      data: {
        labels: weekData.labels,
        datasets: [
          { data: weekData.values, borderColor: "#d946ef", fill: true },
        ],
      },
      options: { plugins: { legend: { display: false } } },
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
      if (b.timestamp) counts[new Date(b.timestamp).getDay()]++;
    });
    return { labels: days, values: counts };
  }

  // Sidebar + Theme
  const themeToggle = document.getElementById("themeToggle");
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");

  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const icon = themeToggle.querySelector("i");
    if (document.body.classList.contains("dark")) {
      icon.classList.replace("fa-moon", "fa-sun");
      localStorage.setItem("clinic_theme", "dark");
    } else {
      icon.classList.replace("fa-sun", "fa-moon");
      localStorage.setItem("clinic_theme", "light");
    }
  });

  if (localStorage.getItem("clinic_theme") === "dark") {
    document.body.classList.add("dark");
    const icon = themeToggle.querySelector("i");
    icon.classList.replace("fa-moon", "fa-sun");
  }

  menuToggle.addEventListener("click", () =>
    sidebar.classList.toggle("active")
  );

  document.addEventListener("click", (e) => {
    if (
      window.innerWidth <= 768 &&
      sidebar.classList.contains("active") &&
      !sidebar.contains(e.target) &&
      e.target !== menuToggle
    ) {
      sidebar.classList.remove("active");
    }
  });

  if (localStorage.getItem("clinic_logged_in") === "true") {
    load();
    setInterval(load, 15000);
  }
});
