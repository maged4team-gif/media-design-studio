export type StorageSource = 'drive' | 'legacy' | 'demo';

export type Project = {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  cover_storage_path?: string | null;
  display_cover_url?: string | null;
  drive_folder_id?: string | null;
  drive_cover_file_id?: string | null;
  category: string | null;
  progress: number; // 0 to 100
  show_progress?: boolean;
  allow_feedback?: boolean;
  is_visible: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  // Computed / joined fields
  file_count?: number;
  comments_count?: number;
  approvals_count?: number;
};

export type AssetType = 'video' | 'image' | 'file';

export type Asset = {
  id: string;
  project_id: string;
  title: string;
  file_url: string;
  thumbnail_url: string | null;
  thumbnail_storage_path?: string | null;
  display_thumbnail_url?: string | null;
  file_type: AssetType;
  mime_type: string | null;
  file_size: number | null;
  duration_seconds: number | null;
  version: string | null; // e.g. 'V1', 'V2', 'Final'
  sort_order: number;
  is_visible: boolean;
  original_filename?: string | null;
  storage_path?: string | null;
  drive_file_id?: string | null;
  drive_folder_id?: string | null;
  source?: StorageSource;
  created_at: string;
  // Ephemeral signed URL for private storage playback/download
  playback_url?: string;
  // Joined fields
  approvals?: Approval[];
  comments?: Comment[];
};

export type AccessLink = {
  id: string;
  viewer_name: string;
  slug: string;
  password_hash: string;
  password_plain?: string | null;
  enabled: boolean;
  session_version: number;
  created_at: string;
  project_ids?: string[];
  has_password?: boolean;
};

export type AccessLinkProject = {
  access_link_id: string;
  project_id: string;
  created_at: string;
};

export type Comment = {
  id: string;
  asset_id: string;
  access_link_id: string | null;
  author_name: string;
  body: string;
  timestamp_seconds: number | null;
  created_at: string;
};

export type Approval = {
  id: string;
  asset_id: string;
  access_link_id: string | null;
  viewer_name: string;
  approved: boolean;
  created_at: string;
  updated_at: string;
};

export type StudioNotification = {
  id: string;
  type: 'comment' | 'approval';
  project_id: string;
  project_title: string;
  project_cover_url: string | null;
  asset_id: string;
  asset_title: string;
  asset_thumbnail_url: string | null;
  client_name: string;
  content: string;
  timestamp_seconds: number | null;
  created_at: string;
};
