// Node 24's built-in SQLite keeps complete events durable across power/network loss.
const { DatabaseSync } = require("node:sqlite");
const { mkdirSync, chmodSync } = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { validateEvent } = require("../backend/eventValidation");

class Outbox {
  constructor(filename, identity, maxBytes = 256 * 1024 * 1024) {
    mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    chmodSync(filename, 0o600);
    this.maxBytes = maxBytes;
    this.db
      .exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS identity (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS event (
        event_id TEXT PRIMARY KEY, payload TEXT, payload_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL DEFAULT 0, lease_id TEXT, locked_until INTEGER,
        last_error TEXT, created_at INTEGER NOT NULL, sent_at INTEGER
      );`);
    try {
      this.db.exec("BEGIN IMMEDIATE");
      this.db
        .prepare("INSERT OR IGNORE INTO identity VALUES (1, ?)")
        .run(identity);
      if (
        this.db.prepare("SELECT value FROM identity WHERE id=1").get().value !==
        identity
      )
        throw new Error(
          "Outbox belongs to another API/gateway/mode. Use its original configuration or a separate outbox.",
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.db.close();
      throw error;
    }
  }
  enqueue(payload, now = Date.now()) {
    const value = validateEvent(payload);
    const id = value.evidence.source_event_id;
    // Keep measurements and original image bytes; never regenerate them on a retry.
    const stored = JSON.stringify({
      ...value.evidence,
      images: value.images.map((image) => ({
        content_type: image.content_type,
        data_base64: image.bytes.toString("base64"),
        captured_at: image.captured_at,
        sequence_number: image.sequence_number,
      })),
    });
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.db
        .prepare("SELECT payload_hash FROM event WHERE event_id=?")
        .get(id);
      if (previous && previous.payload_hash !== value.payloadHash)
        throw new Error("This event ID already belongs to different evidence.");
      if (!previous) {
        const size = this.db
          .prepare(
            "SELECT coalesce(sum(length(CAST(payload AS BLOB))),0) AS size FROM event",
          )
          .get().size;
        if (size + Buffer.byteLength(stored) > this.maxBytes)
          throw new Error(
            "Outbox is full. Restore connectivity or inspect failed events; evidence was not queued.",
          );
        this.db
          .prepare(
            "INSERT INTO event(event_id,payload,payload_hash,created_at) VALUES (?,?,?,?)",
          )
          .run(id, stored, value.payloadHash, now);
      }
      this.db.exec("COMMIT");
      return { event_id: id, duplicate: Boolean(previous) };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  claim(now, leaseMs) {
    return this.db
      .prepare(
        `UPDATE event SET status='PROCESSING', attempts=attempts+1, lease_id=?, locked_until=?
      WHERE event_id=(SELECT event_id FROM event WHERE
        (status='PENDING' AND next_attempt_at<=?) OR (status='PROCESSING' AND locked_until<=?)
        ORDER BY created_at,event_id LIMIT 1) RETURNING *`,
      )
      .get(randomUUID(), now + leaseMs, now, now);
  }
  finish(job, status, error, nextAttempt = 0, now = Date.now()) {
    this.db
      .prepare(
        `UPDATE event SET status=?,last_error=?,next_attempt_at=?,lease_id=NULL,locked_until=NULL,
      sent_at=CASE WHEN ?='SENT' THEN ? ELSE sent_at END,
      payload=CASE WHEN ?='SENT' THEN NULL ELSE payload END WHERE event_id=? AND lease_id=?`,
      )
      .run(
        status,
        error,
        nextAttempt,
        status,
        now,
        status,
        job.event_id,
        job.lease_id,
      );
  }
  retry(id) {
    const result = this.db
      .prepare(
        "UPDATE event SET status='PENDING',next_attempt_at=0,last_error=NULL WHERE event_id=? AND status='FAILED'",
      )
      .run(id);
    if (!result.changes)
      throw new Error("No failed event with that ID was found.");
  }
  status() {
    return this.db
      .prepare(
        "SELECT event_id,status,attempts,last_error,next_attempt_at FROM event ORDER BY created_at,event_id",
      )
      .all();
  }
  close() {
    this.db.close();
  }
}
module.exports = { Outbox };
