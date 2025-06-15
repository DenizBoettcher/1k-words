import React from "react";

interface ProgressBarProps {
  /** distinct words shown so far */
  covered: number;
  /** total words in the current session */
  total: number;
  /** minimum #times any word has appeared */
  minHits: number;
  /** threshold for "good enough" repetitions (default 3) */
  targetReps?: number;
  /** width in pixels for the bar (default 220) */
  width?: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  covered,
  total,
  minHits,
  targetReps = 3,
  width = "100%",
}) => {
  const percent = total === 0 ? 0 : (covered / total) * 100;

  return (
    <div style={{ marginTop: 55, width }}>
      {/* labels */}
      <div
        style={{
          fontSize: 16,
          marginTop: 4,
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 5
        }}
      >
        <span>
          {covered}/{total} words
        </span>
        <span>
          least&nbsp;shown&nbsp;{minHits}/{targetReps}
        </span>
      </div>

      {/* bar */}
      <div
        style={{
          height: 6,
          background: "#ccc",
          borderRadius: 3,
          overflow: "hidden",
          marginBottom: 15
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background: "#4caf50",
          }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;