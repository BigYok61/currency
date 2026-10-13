-- APNs-Gerätetoken je Abo (iPhone-App). Ohne Token bleibt ntfy (Web-App) der Weg.
ALTER TABLE subscriptions ADD COLUMN apns_token TEXT;
ALTER TABLE subscriptions ADD COLUMN apns_env TEXT;
