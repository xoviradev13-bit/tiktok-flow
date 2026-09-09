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

    const targetBucket = (formData.get("bucket") as string) || BUCKET_NAME;
    const folder = (formData.get("folder") as string) || (targetBucket === "avatars" ? "users" : "reports");
    const uploadedUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate MIME type
      if (!file.type.startsWith("image/")) {
        return NextResponse.json(
          { error: `Tệp "${file.name}" không phải định dạng ảnh hợp lệ (PNG, JPG, WEBP, GIF).` },
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
      const ext = file.name.split(".").pop() || "png";
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
        const uploadDir = path.join(process.cwd(), "public", "uploads", targetBucket, folder);
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        const localDest = path.join(uploadDir, sanitizedName);
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
