import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 38,
          background: "linear-gradient(145deg, #091122 0%, #12336f 100%)",
          color: "white",
          fontSize: 108,
          fontWeight: 900,
          letterSpacing: "-0.08em",
          border: "8px solid #2f6cff",
        }}
      >
        C
      </div>
    ),
    size
  );
}
