import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import {
  getClassroomInviteMetadataInput,
  getClassroomShareDataByToken,
} from "@/lib/classroomShare";

export const runtime = "nodejs";
export const revalidate = 0;

function coverTile(url: string, left: number, top: number, width: number, height: number) {
  return (
    <img
      key={`${url}:${left}:${top}`}
      src={url}
      alt=""
      width={width}
      height={height}
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        objectFit: "cover",
        borderRadius: 22,
        border: "1px solid rgba(255,255,255,0.18)",
      }}
    />
  );
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  const share = await getClassroomShareDataByToken(token);
  const meta = getClassroomInviteMetadataInput(token, share);

  const covers = share?.coverUrls || [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(135deg, #0f2740 0%, #18395a 46%, #f4c95a 130%)",
          color: "#fffaf0",
          fontFamily: "Arial",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at top left, rgba(255,255,255,0.18), transparent 34%), radial-gradient(circle at bottom right, rgba(244,201,90,0.22), transparent 32%)",
          }}
        />

        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            padding: "44px 46px",
            gap: 34,
          }}
        >
          <div
            style={{
              width: 560,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  alignSelf: "flex-start",
                  padding: "10px 18px",
                  borderRadius: 999,
                  background: "rgba(244,201,90,0.18)",
                  border: "1px solid rgba(244,201,90,0.38)",
                  color: "#f4c95a",
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Classroom Invite
              </div>
              <div
                style={{
                  fontSize: 58,
                  lineHeight: 1.05,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                }}
              >
                {share?.title || "GeoHistory Classroom"}
              </div>
              <div
                style={{
                  fontSize: 24,
                  lineHeight: 1.4,
                  color: "rgba(255,250,240,0.82)",
                  maxHeight: 132,
                  overflow: "hidden",
                }}
              >
                {meta.description}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  fontSize: 26,
                  color: "#f4c95a",
                  fontWeight: 700,
                }}
              >
                GeoHistory
              </div>
              <div
                style={{
                  fontSize: 20,
                  color: "rgba(255,250,240,0.78)",
                }}
              >
                Open the link to join the classroom and explore its assigned journeys.
              </div>
            </div>
          </div>

          <div
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              borderRadius: 30,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.14)",
              overflow: "hidden",
            }}
          >
            {covers.length ? (
              <>
                {coverTile(covers[0], 20, 20, 360, 220)}
                {coverTile(covers[1] || covers[0], 250, 146, 360, 220)}
                {coverTile(covers[2] || covers[0], 58, 260, 320, 190)}
                {coverTile(covers[3] || covers[1] || covers[0], 340, 18, 250, 150)}
              </>
            ) : (
              <div
                style={{
                  position: "absolute",
                  inset: 24,
                  borderRadius: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  color: "rgba(255,250,240,0.8)",
                  fontSize: 28,
                  textAlign: "center",
                  padding: 24,
                }}
              >
                GeoHistory Classroom
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}

