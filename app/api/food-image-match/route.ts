import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function hasValidSignature(bytes: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/gif") return bytes.subarray(0, 6).toString("ascii").startsWith("GIF8");
  if (mimeType === "image/webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in as a staff member to identify a meal." }, { status: 401 });
  if (user.role !== "SUPERVISOR") return NextResponse.json({ error: "Only staff members can identify listing meals." }, { status: 403 });

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_IMAGE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "The image must be 10 MB or smaller." }, { status: 413 });
  }

  let upload: FormData;
  try {
    upload = await request.formData();
  } catch {
    return NextResponse.json({ error: "Upload a valid image file." }, { status: 400 });
  }
  const image = upload.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "Choose an image before processing." }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "The image must be 10 MB or smaller." }, { status: 413 });
  const extension = EXTENSIONS[image.type];
  if (!extension) return NextResponse.json({ error: "Use a JPEG, PNG, WebP, or GIF image." }, { status: 415 });

  const foods = await prisma.food.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true },
  });
  if (!foods.length) return NextResponse.json({ error: "There are no catalog foods to match." }, { status: 422 });

  let tempDirectory: string | undefined;
  try {
    const imageBytes = Buffer.from(await image.arrayBuffer());
    if (!hasValidSignature(imageBytes, image.type)) {
      return NextResponse.json({ error: "The uploaded file is not a valid image." }, { status: 415 });
    }

    tempDirectory = await mkdtemp(join(tmpdir(), "secondhelping-meal-match-"));
    const imagePath = join(tempDirectory, `meal${extension}`);
    const catalogPath = join(tempDirectory, "catalog.json");
    await Promise.all([
      writeFile(imagePath, imageBytes),
      writeFile(catalogPath, JSON.stringify(foods), "utf8"),
    ]);

    const scriptPath = join(process.cwd(), "app/scripts", "classify_meal.py");
    const python = process.env.PYTHON_PATH || (process.platform === "win32" ? "python" : "python3");
    const { stdout } = await execFileAsync(python, [scriptPath, imagePath, "--catalog", catalogPath, "--id-only"], {
      timeout: 180_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    const foodId = stdout.trim();
    if (!foodId) return NextResponse.json({ error: "The model could not confidently match a catalog dish. Choose one manually." }, { status: 422 });

    const match = foods.find((food) => food.id === foodId);
    if (!match) return NextResponse.json({ error: "The model returned a dish outside the current catalog." }, { status: 502 });
    return NextResponse.json({ foodId: match.id, foodName: match.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Food image matching failed:", message);
    return NextResponse.json({ error: "Food identification is unavailable. Check that Python and the Ollama vision model are running." }, { status: 503 });
  } finally {
    if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
