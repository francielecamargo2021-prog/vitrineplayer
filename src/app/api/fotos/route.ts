import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { MAX_UPLOAD_BYTES, PhotoError, photosReady, storePhoto } from "@/lib/photos/server";

/**
 * Envio de foto: POST multipart { athleteId, file, replace? }.
 * Exige sessão e mesma origem; quem decide se o usuário pode enviar é o banco (RLS).
 */
export const dynamic = "force-dynamic";

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  return !origin || origin === req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!photosReady()) return NextResponse.json({ error: "backend" }, { status: 503 });
  const user = await currentUser();
  if (!user || !user.emailVerified) return NextResponse.json({ error: "auth" }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "tooBig" }, { status: 413 });
  }
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ error: "badType" }, { status: 400 });
  }
  const file = fd.get("file");
  const athleteId = String(fd.get("athleteId") ?? "");
  const replace = String(fd.get("replace") ?? "") || undefined;
  if (!(file instanceof Blob)) return NextResponse.json({ error: "badType" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "tooBig" }, { status: 413 });
  try {
    await storePhoto(user.id, athleteId, Buffer.from(await file.arrayBuffer()), replace);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const code = e instanceof PhotoError ? e.code : "save";
    const status = { full: 409, badType: 400, tooBig: 413, forbidden: 403, notFound: 404, save: 500 }[code];
    return NextResponse.json({ error: code }, { status });
  }
}
