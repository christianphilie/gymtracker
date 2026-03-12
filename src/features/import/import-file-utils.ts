const MAX_IMAGE_DIMENSION = 1800;
const IMAGE_COMPRESSION_QUALITY = 0.82;

export const AI_IMPORT_MAX_FILE_BYTES = 4 * 1024 * 1024;
export const AI_IMPORT_ACCEPT_ATTRIBUTE = "application/pdf,image/jpeg,image/png,image/webp";

export interface EncodedAiImportFile {
  name: string;
  mimeType: string;
  data: string;
  sizeBytes: number;
}

function isSupportedMimeType(mimeType: string) {
  return ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mimeType);
}

function changeFileExtension(name: string, extension: string) {
  const lastDotIndex = name.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    return `${name}${extension}`;
  }
  return `${name.slice(0, lastDotIndex)}${extension}`;
}

async function blobToBase64(blob: Blob) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("file-read-failed"));
    };
    reader.onerror = () => reject(new Error("file-read-failed"));
    reader.readAsDataURL(blob);
  });

  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

async function loadImageFromFile(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("image-load-failed"));
      element.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function compressImageFile(file: File) {
  const image = await loadImageFromFile(file);
  const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = largestSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / largestSide : 1;
  const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return file;
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const compressedBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", IMAGE_COMPRESSION_QUALITY);
  });

  if (!compressedBlob || compressedBlob.size >= file.size) {
    return file;
  }

  return new File([compressedBlob], changeFileExtension(file.name, ".jpg"), {
    type: "image/jpeg",
    lastModified: file.lastModified
  });
}

async function optimizeFile(file: File) {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  if (file.size <= AI_IMPORT_MAX_FILE_BYTES) {
    return file;
  }

  return compressImageFile(file);
}

export async function encodeAiImportFile(file: File): Promise<EncodedAiImportFile> {
  if (!isSupportedMimeType(file.type)) {
    throw new Error("unsupported-file-type");
  }

  const optimizedFile = await optimizeFile(file);
  if (optimizedFile.size > AI_IMPORT_MAX_FILE_BYTES) {
    throw new Error("file-too-large");
  }

  return {
    name: optimizedFile.name,
    mimeType: optimizedFile.type,
    data: await blobToBase64(optimizedFile),
    sizeBytes: optimizedFile.size
  };
}
