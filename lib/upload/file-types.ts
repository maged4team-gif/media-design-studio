/** File types the admin can upload. Shared by the upload routes and the uploader's file picker. */
export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  // Images
  'jpg', 'jpeg', 'png', 'webp',
  // Video
  'mp4', 'mov', 'm4v', 'webm',
  // Audio
  'mp3', 'wav', 'm4a', 'aac', 'ogg',
  // Documents
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv',
  // Archives
  'zip', 'rar',
  // Design sources
  'ai', 'psd', 'aep', 'c4d',
]);

export const UPLOAD_ACCEPT_ATTRIBUTE = Array.from(ALLOWED_UPLOAD_EXTENSIONS, (ext) => `.${ext}`).join(',');
