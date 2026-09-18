import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase, BUCKET_NAME, MAX_IMAGE_COUNT, MAX_IMAGE_SIZE_BYTES } from "@/lib/supabase";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    // 1. Strict Authentication Check: Only logged-in users can upload
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Bạn cần đăng nhập để tải ảnh lên hệ thống." },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "Vui lòng chọn ít nhất 1 ảnh để tải lên." },
        { status: 400 }
      );
    }

    // 2. Validate maximum file count: Max 5 images
    if (files.length > MAX_IMAGE_COUNT) {
      return NextResponse.json(
        { error: `Chỉ được tải lên tối đa ${MAX_IMAGE_COUNT} ảnh mỗi lần.` },
        { status: 400 }
      );
    }

    const ALLOWED_BUCKETS = new Set(["avatars", "reports", "tiktokflow", "uploads"]);
    const ALLOWED_FOLDERS = new Set(["users", "reports", "avatars", "proofs", "checklist"]);
    const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

    const rawBucket = (formData.get("bucket") as string) || BUCKET_NAME;
    const targetBucket = ALLOWED_BUCKETS.has(rawBucket) ? rawBucket : BUCKET_NAME;

    const rawFolder = (formData.get("folder") as string) || (targetBucket === "avatars" ? "users" : "reports");
    const sanitizedFolder = rawFolder.replace(/[^a-zA-Z0-9_-]/g, "");
    const folder = ALLOWED_FOLDERS.has(sanitizedFolder) ? sanitizedFolder : "reports";

    const uploadedUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate MIME type
      if (!file.type.startsWith("image/")) {
        return NextResponse.json(
          { error: `Tệp "${file.name}" không phải định dạng ảnh hợp lệ (PNG, JPG, WEBP).` },
          { status: 400 }
        );
      }

      // Validate file size: Max 5MB
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `Ảnh "${file.name}" vượt quá giới hạn 5MB cho phép (${(file.size / (1024 * 1024)).toFixed(1)}MB).` },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const rawExt = (file.name.split(".").pop() || "png").toLowerCase();
      const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : "png";
      const sanitizedName = `${userId}_${Date.now()}_${i}.${ext}`;
      const filePath = `${folder}/${sanitizedName}`;

      let fileUploaded = false;

      // Try uploading to Supabase Storage
      try {
        const { data, error } = await supabase.storage
          .from(targetBucket)
          .upload(filePath, buffer, {
            contentType: file.type,
            upsert: true,
          });

        if (!error && data) {
          const { data: publicData } = supabase.storage
            .from(targetBucket)
            .getPublicUrl(filePath);

          if (publicData?.publicUrl) {
            uploadedUrls.push(publicData.publicUrl);
            fileUploaded = true;
          }
        }
      } catch (err: any) {
        console.warn("[Upload] Supabase direct upload note:", err?.message);
      }

      // Graceful local fallback to public/uploads if Supabase storage is not initialized
      if (!fileUploaded) {
        const uploadsBaseDir = path.resolve(process.cwd(), "public", "uploads");
        const uploadDir = path.resolve(uploadsBaseDir, targetBucket, folder);
        if (!uploadDir.startsWith(uploadsBaseDir)) {
          return NextResponse.json({ error: "Thư mục tải lên không hợp lệ." }, { status: 400 });
        }
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        const localDest = path.resolve(uploadDir, sanitizedName);
        if (!localDest.startsWith(uploadDir)) {
          return NextResponse.json({ error: "Đường dẫn tệp không hợp lệ." }, { status: 400 });
        }
        fs.writeFileSync(localDest, buffer);
        uploadedUrls.push(`/uploads/${targetBucket}/${folder}/${sanitizedName}`);
      }
    }

    return NextResponse.json({
      success: true,
      urls: uploadedUrls,
      count: uploadedUrls.length,
    });
  } catch (error: any) {
    console.error("[Upload] Error processing files:", error);
    return NextResponse.json(
      { error: error.message || "Lỗi xử lý tệp ảnh trên máy chủ." },
      { status: 500 }
    );
  }
}
