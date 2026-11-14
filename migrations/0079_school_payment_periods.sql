ALTER TABLE school_payment_modalities ADD COLUMN period_start_on TEXT;
ALTER TABLE school_payment_modalities ADD COLUMN period_end_on TEXT;
ALTER TABLE school_payment_modalities ADD COLUMN advance_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE school_payment_modalities ADD COLUMN proration_method TEXT NOT NULL DEFAULT 'days';
ALTER TABLE school_payment_modalities ADD COLUMN class_weekdays TEXT NOT NULL DEFAULT '[]';
ALTER TABLE school_payment_modalities ADD COLUMN class_dates_added TEXT NOT NULL DEFAULT '[]';
ALTER TABLE school_payment_modalities ADD COLUMN class_dates_excluded TEXT NOT NULL DEFAULT '[]';
ALTER TABLE school_payment_modalities ADD COLUMN period_migration_token TEXT;

ALTER TABLE school_payment_obligations ADD COLUMN period_start_on TEXT;
ALTER TABLE school_payment_obligations ADD COLUMN period_end_on TEXT;
ALTER TABLE school_payment_obligations ADD COLUMN modality_valid_from TEXT;
ALTER TABLE school_payment_obligations ADD COLUMN available_from TEXT;
ALTER TABLE school_payment_obligations ADD COLUMN overdue_from TEXT;
ALTER TABLE school_subprogram_payment_schedules ADD COLUMN calendar_revision INTEGER NOT NULL DEFAULT 0;
