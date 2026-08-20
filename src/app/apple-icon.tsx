import { ImageResponse } from "next/og";
import { centrumBrandMarkDataUri } from "@/lib/brand-mark-data";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <img
        src={centrumBrandMarkDataUri}
        alt=""
        width={180}
        height={180}
        style={{ width: "100%", height: "100%" }}
      />
    ),
    size
  );
}
