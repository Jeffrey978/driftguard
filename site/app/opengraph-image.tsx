import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "DriftGuard: catch the drift, keep the hour. A free browser extension that asks one quick question when a tab pulls you off course.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Manrope from Google Fonts as TTF (satori can't read woff2). Falls back to the default font offline. */
async function loadManrope() {
  const weights = [500, 800] as const;
  try {
    return await Promise.all(
      weights.map(async (weight) => {
        const css = await (
          await fetch(`https://fonts.googleapis.com/css2?family=Manrope:wght@${weight}`)
        ).text();
        const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
        if (!src) throw new Error("no ttf");
        const data = await (await fetch(src)).arrayBuffer();
        return { name: "Manrope", data, weight, style: "normal" as const };
      }),
    );
  } catch {
    return undefined;
  }
}

export default async function Image() {
  // resvg ignores the SVG's <style> block, so give the ground shadow its resting opacity inline.
  const svg = (await readFile(join(process.cwd(), "public/mascot/happy.svg"), "utf8")).replace(
    'class="shadow"',
    'class="shadow" opacity=".14"',
  );
  const mascot = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const fonts = await loadManrope();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#F7F6F4",
          fontFamily: fonts ? "Manrope" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 0 0 80px", width: 700 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 800, color: "#1A1A1A" }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                border: "7px solid #E5552E",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 999, background: "#1A1A1A" }} />
            </div>
            DriftGuard
          </div>
          <div style={{ marginTop: 44, fontSize: 84, fontWeight: 800, letterSpacing: -3, lineHeight: 1.02, color: "#1A1A1A" }}>
            Catch the drift.
          </div>
          <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -3, lineHeight: 1.02, color: "#E5552E" }}>
            Keep the hour.
          </div>
          <div style={{ marginTop: 32, fontSize: 28, fontWeight: 500, lineHeight: 1.4, color: "#5B5955" }}>
            A free browser extension that asks one quick question when a tab pulls you off course.
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: 24,
            borderRadius: 32,
            background:
              "radial-gradient(circle at 55% 40%, #FF9442 0%, #FF5A1F 22%, #CF2A26 45%, #8E0F24 62%, #F3C9A8 80%, #FBE3D3 100%)",
          }}
        >
          <div
            style={{
              width: 330,
              height: 330,
              borderRadius: 999,
              background: "rgba(251,227,211,0.75)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img src={mascot} width={260} height={260} alt="" />
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
