import { useEffect, useRef } from "react";
import {
  Chart,
  DoughnutController,
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  PieController,
  LineController,
  LineElement,
  PointElement,
} from "chart.js";

Chart.register(
  DoughnutController,
  PieController,
  ArcElement,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip
);

export type ChartSpec = {
  id: string;
  type: string;
  title: string;
  labels: string[];
  values: number[];
  unit?: string;
};

export type Metrics = {
  total_files: number;
  total_tests: number;
  passed: number;
  failed: number;
  pass_rate_percent: number;
  headline?: string;
};

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899"];

type Props = {
  metrics: Metrics;
  charts: ChartSpec[];
};

function ChartCanvas({ spec }: { spec: ChartSpec }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const instance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    instance.current?.destroy();
    const isPercent = spec.unit === "percent";
    const type =
      spec.type === "pie" ? "pie" : spec.type === "line" ? "line" : spec.type === "doughnut" ? "doughnut" : "bar";

    instance.current = new Chart(ref.current, {
      type: type as "bar" | "doughnut" | "pie" | "line",
      data: {
        labels: spec.labels,
        datasets: [
          {
            label: spec.title,
            data: spec.values,
            backgroundColor: spec.labels.map((_, i) => COLORS[i % COLORS.length]),
            borderRadius: type === "bar" ? 6 : 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#cbd5e1" } } },
        scales:
          type === "bar" || type === "line"
            ? {
                x: { ticks: { color: "#9ca3af" }, grid: { color: "#2d3a4f" } },
                y: {
                  beginAtZero: true,
                  max: isPercent ? 100 : undefined,
                  ticks: { color: "#9ca3af" },
                  grid: { color: "#2d3a4f" },
                },
              }
            : undefined,
      },
    });
    return () => instance.current?.destroy();
  }, [spec]);

  return (
    <div className="chart-card">
      <h3>{spec.title}</h3>
      <div className="chart-wrap">
        <canvas ref={ref} />
      </div>
    </div>
  );
}

export default function ResultCharts({ metrics, charts }: Props) {
  return (
    <div className="viz">
      {metrics.headline && <p className="headline">{metrics.headline}</p>}
      <div className="kpi-row">
        <div className="kpi-card kpi-highlight">
          <div className="kpi-value">{metrics.pass_rate_percent}%</div>
          <div className="kpi-label">总通过率</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{metrics.total_tests}</div>
          <div className="kpi-label">检测项总数</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value pass">{metrics.passed}</div>
          <div className="kpi-label">通过</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value fail">{metrics.failed}</div>
          <div className="kpi-label">不通过</div>
        </div>
      </div>
      {charts.length > 0 ? (
        <div className="charts-grid">
          {charts.map((c) => (
            <ChartCanvas key={c.id} spec={c} />
          ))}
        </div>
      ) : (
        <p className="muted">暂无图表数据</p>
      )}
    </div>
  );
}
