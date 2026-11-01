-- Voice notes: browsers record Opus in WebM (Chrome, Firefox, Edge) or AAC in MP4 (Safari).
-- Also accept common audio uploads (M4A, WAV, OGG).
update storage.buckets
set allowed_mime_types = array[
  'application/pdf', 'video/mp4',
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp'
]
where id = 'project-files';
