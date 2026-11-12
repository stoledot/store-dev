CREATE TABLE IF NOT EXISTS social_groups (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS social_group_members (
  group_id TEXT NOT NULL REFERENCES social_groups(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(group_id,email)
);
CREATE INDEX IF NOT EXISTS social_group_members_email ON social_group_members(email COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES social_groups(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL COLLATE NOCASE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS social_posts_group_created ON social_posts(group_id,created_at DESC);
CREATE TABLE IF NOT EXISTS social_post_likes (
  post_id TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(post_id,email)
);
CREATE TABLE IF NOT EXISTS social_saved_posts (
  post_id TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(post_id,email)
);
CREATE TABLE IF NOT EXISTS social_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES social_comments(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL COLLATE NOCASE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS social_comments_post ON social_comments(post_id,created_at);
CREATE TABLE IF NOT EXISTS social_comment_likes (
  comment_id TEXT NOT NULL REFERENCES social_comments(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(comment_id,email)
);
CREATE TABLE IF NOT EXISTS social_notifications (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL COLLATE NOCASE,
  actor_email TEXT NOT NULL COLLATE NOCASE,
  kind TEXT NOT NULL CHECK(kind IN ('group_post','comment')),
  group_id TEXT REFERENCES social_groups(id) ON DELETE CASCADE,
  post_id TEXT REFERENCES social_posts(id) ON DELETE CASCADE,
  comment_id TEXT REFERENCES social_comments(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS social_notifications_inbox ON social_notifications(to_email,read_at,created_at DESC);
ALTER TABLE customer_profiles ADD COLUMN social_avatar_image_key TEXT;
