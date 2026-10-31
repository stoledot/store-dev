ALTER TABLE school_notifications
ADD COLUMN body TEXT NOT NULL DEFAULT '';
ALTER TABLE school_notifications
ADD COLUMN href TEXT NOT NULL DEFAULT '';