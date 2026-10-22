-- Eine Zeile je Dokument, Inhalt ist das JSON in der heutigen Form.
CREATE TABLE IF NOT EXISTS documents (
  key TEXT PRIMARY KEY,
  body TEXT NOT NULL
);
