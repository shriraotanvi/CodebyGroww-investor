interface Props {
  data: number[];
  positive: boolean;
  width?: number;
  height?: number;
}

export default function Sparkline({ data, positive, width = 96, height = 32 }: Props) {
  if (data.length < 2) {
    return <div style={{ width, height }} className="flex items-center justify-center text-[10px] text-slate-400">—</div>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`).join(" ");
  const color = positive ? "#22c55e" : "#f43f5e";
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      style={{ maxWidth: width, display: "block" }}
      className="overflow-visible"
    >
      <polyline points={areaPoints} fill={color} opacity={0.08} stroke="none" />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
