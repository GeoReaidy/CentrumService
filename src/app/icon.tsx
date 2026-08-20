import { ImageResponse } from "next/og";
import { centrumBrandMarkDataUri } from "@/lib/brand-mark-data";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <img
        src={centrumBrandMarkDataUri}
        alt=""
        width={64}
        height={64}
        style={{ width: "100%", height: "100%" }}
      />
    ),
    size
  );
}
