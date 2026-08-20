import { ImageResponse } from "next/og";
import { centrumBrandMarkDataUri } from "@/lib/brand-mark-data";

export const alt = "Centrum Service — local internet service in North Bekaa";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px 78px",
          background:
            "linear-gradient(135deg, #05070f 0%, #091122 45%, #12336f 100%)",
          color: "white",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <img
            src={centrumBrandMarkDataUri}
            alt=""
            width={82}
            height={82}
            style={{ width: 82, height: 82, borderRadius: 20 }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ fontSize: 35, fontWeight: 900 }}>Centrum Service</div>
            <div style={{ fontSize: 20, color: "#9eb8f8" }}>North Bekaa, Lebanon</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              maxWidth: 940,
              fontSize: 68,
              lineHeight: 1.04,
              fontWeight: 900,
              letterSpacing: "-0.035em",
            }}
          >
            Local internet for homes and businesses
          </div>
          <div
            style={{
              maxWidth: 920,
              fontSize: 28,
              lineHeight: 1.35,
              color: "#c8d5f6",
            }}
          >
            Compare plans, check coverage, and contact a local support team across North Bekaa.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#9eb8f8",
            fontSize: 21,
          }}
        >
          <div>centrumservice.net</div>
          <div>Plans • Coverage • Support</div>
        </div>
      </div>
    ),
    size
  );
}
