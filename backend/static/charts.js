const CHART_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#ef4444",
];

let chartInstances = [];

function destroyCharts() {
  chartInstances.forEach((c) => c.destroy());
  chartInstances = [];
}

function formatMetricValue(key, value) {
  if (key === "pass_rate_percent") return `${value}%`;
  return String(value);
}

function renderKpiCards(metrics) {
  const el = document.getElementById("kpiRow");
  if (!metrics || !el) return;
  const rate = metrics.pass_rate_percent ?? 0;
  const cards = [
    { label: "总通过率", value: `${rate}%`, highlight: true },
    { label: "检测项总数", value: metrics.total_tests ?? 0 },
    { label: "通过", value: metrics.passed ?? 0, color: "#22c55e" },
    { label: "不通过", value: metrics.failed ?? 0, color: "#ef4444" },
  ];
  el.innerHTML = cards
    .map(
      (c) => `
    <div class="kpi-card ${c.highlight ? "kpi-highlight" : ""}">
      <div class="kpi-value" style="${c.color ? `color:${c.color}` : ""}">${c.value}</div>
      <div class="kpi-label">${c.label}</div>
    </div>`
    )
    .join("");

  const headlineEl = document.getElementById("headline");
  if (headlineEl) {
    headlineEl.textContent = metrics.headline || "";
    headlineEl.style.display = metrics.headline ? "block" : "none";
  }
}

function colorsForChart(chart) {
  if (chart.id === "pass_fail" || chart.title.includes("通过")) {
    return chart.labels.map((lb) =>
      /不|失败|不合格|fail/i.test(lb) ? "#ef4444" : "#22c55e"
    );
  }
  if (chart.type === "doughnut" || chart.type === "pie") {
    return chart.labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
  }
  return chart.labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
}

function buildDataset(chart) {
  const unit = chart.unit || "";
  const isPercent = unit === "percent";
  return {
    labels: chart.labels,
    datasets: [
      {
        label: chart.title,
        data: chart.values,
        backgroundColor: colorsForChart(chart),
        borderColor: "#1a2332",
        borderWidth: 1,
        borderRadius: chart.type === "bar" ? 6 : 0,
      },
    ],
    _isPercent: isPercent,
  };
}

function renderCharts(charts) {
  const grid = document.getElementById("chartsGrid");
  const empty = document.getElementById("chartsEmpty");
  destroyCharts();
  if (!grid) return;

  if (!charts || !charts.length) {
    grid.innerHTML = "";
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";

  grid.innerHTML = charts
    .map(
      (ch, i) => `
    <div class="chart-card">
      <h3>${escapeHtml(ch.title)}</h3>
      <div class="chart-wrap"><canvas id="chart-${i}"></canvas></div>
    </div>`
    )
    .join("");

  charts.forEach((chart, i) => {
    const canvas = document.getElementById(`chart-${i}`);
    if (!canvas) return;
    const ds = buildDataset(chart);
    const isPercent = ds._isPercent;
    delete ds._isPercent;

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: chart.type === "doughnut" || chart.type === "pie",
          labels: { color: "#cbd5e1" },
        },
      },
      scales:
        chart.type === "bar" || chart.type === "line"
          ? {
              x: { ticks: { color: "#9ca3af" }, grid: { color: "#2d3a4f" } },
              y: {
                beginAtZero: true,
                max: isPercent ? 100 : undefined,
                ticks: {
                  color: "#9ca3af",
                  callback: (v) => (isPercent ? `${v}%` : v),
                },
                grid: { color: "#2d3a4f" },
              },
            }
          : undefined,
    };

    const instance = new Chart(canvas, {
      type: chart.type === "pie" ? "pie" : chart.type,
      data: ds,
      options,
    });
    chartInstances.push(instance);
  });
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function renderAnalysisResult(data) {
  renderKpiCards(data.metrics);
  renderCharts(data.charts);
  const resultEl = document.getElementById("result");
  if (resultEl) resultEl.textContent = data.conclusion || "";
}

function clearAnalysisResult() {
  destroyCharts();
  ["kpiRow", "chartsGrid", "result"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });
  const headline = document.getElementById("headline");
  if (headline) headline.style.display = "none";
  const empty = document.getElementById("chartsEmpty");
  if (empty) empty.style.display = "none";
}
