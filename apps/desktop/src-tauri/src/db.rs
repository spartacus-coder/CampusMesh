use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DbMessage {
    pub id: String,
    #[serde(alias = "conversation_id")]
    pub conversation_id: String,
    #[serde(alias = "sender_fingerprint")]
    pub sender_fingerprint: String,
    #[serde(alias = "recipient_fingerprint")]
    pub recipient_fingerprint: Option<String>,
    pub content: String,
    #[serde(alias = "content_type")]
    pub content_type: String,
    pub timestamp: i64,
    #[serde(alias = "delivery_state")]
    pub delivery_state: String,
    #[serde(alias = "is_outgoing")]
    pub is_outgoing: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DbConversation {
    pub id: String,
    pub name: String,
    #[serde(alias = "peer_fingerprint")]
    pub peer_fingerprint: Option<String>,
    #[serde(alias = "is_group")]
    pub is_group: bool,
    #[serde(alias = "last_message_preview")]
    pub last_message_preview: Option<String>,
    #[serde(alias = "last_message_timestamp")]
    pub last_message_timestamp: i64,
    #[serde(alias = "unread_count")]
    pub unread_count: i32,
    #[serde(alias = "is_pinned")]
    pub is_pinned: bool,
    #[serde(alias = "is_archived")]
    pub is_archived: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DbContact {
    pub fingerprint: String,
    #[serde(alias = "display_name")]
    pub display_name: String,
    #[serde(alias = "safety_number")]
    pub safety_number: Option<String>,
    #[serde(alias = "is_verified")]
    pub is_verified: bool,
    #[serde(alias = "added_at")]
    pub added_at: i64,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: PathBuf) -> Result<Self> {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                sender_fingerprint TEXT NOT NULL,
                recipient_fingerprint TEXT,
                content TEXT NOT NULL,
                content_type TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                delivery_state TEXT NOT NULL,
                is_outgoing INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, timestamp);

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                peer_fingerprint TEXT,
                is_group INTEGER NOT NULL DEFAULT 0,
                last_message_preview TEXT,
                last_message_timestamp INTEGER NOT NULL,
                unread_count INTEGER NOT NULL DEFAULT 0,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                is_archived INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS contacts (
                fingerprint TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                safety_number TEXT,
                is_verified INTEGER NOT NULL DEFAULT 0,
                added_at INTEGER NOT NULL
            );

            -- Auto-heal and sync conversations table from any stored messages
            INSERT OR IGNORE INTO conversations (
                id, name, peer_fingerprint, is_group,
                last_message_preview, last_message_timestamp,
                unread_count, is_pinned, is_archived
            )
            SELECT 
                m.conversation_id,
                COALESCE(c.display_name, 'Contact'),
                COALESCE(m.recipient_fingerprint, m.sender_fingerprint),
                0,
                m.content,
                m.timestamp,
                0,
                0,
                0
            FROM messages m
            LEFT JOIN contacts c ON c.fingerprint = COALESCE(m.recipient_fingerprint, m.sender_fingerprint)
            WHERE m.timestamp = (
                SELECT MAX(m2.timestamp) FROM messages m2 WHERE m2.conversation_id = m.conversation_id
            )
            ON CONFLICT(id) DO UPDATE SET
                last_message_preview = excluded.last_message_preview,
                last_message_timestamp = excluded.last_message_timestamp;
            ",
        )?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn save_message(&self, msg: DbMessage) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO messages (
                id, conversation_id, sender_fingerprint, recipient_fingerprint,
                content, content_type, timestamp, delivery_state, is_outgoing
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                msg.id,
                msg.conversation_id,
                msg.sender_fingerprint,
                msg.recipient_fingerprint,
                msg.content,
                msg.content_type,
                msg.timestamp,
                msg.delivery_state,
                if msg.is_outgoing { 1 } else { 0 },
            ],
        )?;

        // Ensure conversations table is always updated with latest message
        let peer_fp = if msg.is_outgoing {
            msg.recipient_fingerprint.clone()
        } else {
            Some(msg.sender_fingerprint.clone())
        };
        let _ = conn.execute(
            "INSERT INTO conversations (
                id, name, peer_fingerprint, is_group,
                last_message_preview, last_message_timestamp,
                unread_count, is_pinned, is_archived
            ) VALUES (?1, ?2, ?3, 0, ?4, ?5, 0, 0, 0)
            ON CONFLICT(id) DO UPDATE SET
                last_message_preview = excluded.last_message_preview,
                last_message_timestamp = excluded.last_message_timestamp",
            params![
                msg.conversation_id,
                peer_fp.as_deref().unwrap_or("Peer"),
                peer_fp,
                msg.content,
                msg.timestamp,
            ],
        );

        Ok(())
    }

    pub fn get_messages(&self, conversation_id: &str) -> Result<Vec<DbMessage>> {
        let conn = self.conn.lock().unwrap();
        let alt_id = if let Some(stripped) = conversation_id.strip_prefix("conv-") {
            stripped.to_string()
        } else {
            format!("conv-{}", conversation_id)
        };
        let mut stmt = conn.prepare(
            "SELECT id, conversation_id, sender_fingerprint, recipient_fingerprint,
                    content, content_type, timestamp, delivery_state, is_outgoing
             FROM messages
             WHERE conversation_id = ?1 OR conversation_id = ?2
             ORDER BY timestamp ASC",
        )?;
        let rows = stmt.query_map(params![conversation_id, alt_id], |row| {
            Ok(DbMessage {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                sender_fingerprint: row.get(2)?,
                recipient_fingerprint: row.get(3)?,
                content: row.get(4)?,
                content_type: row.get(5)?,
                timestamp: row.get(6)?,
                delivery_state: row.get(7)?,
                is_outgoing: row.get::<_, i32>(8)? != 0,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn save_conversation(&self, conv: DbConversation) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO conversations (
                id, name, peer_fingerprint, is_group,
                last_message_preview, last_message_timestamp,
                unread_count, is_pinned, is_archived
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                conv.id,
                conv.name,
                conv.peer_fingerprint,
                if conv.is_group { 1 } else { 0 },
                conv.last_message_preview,
                conv.last_message_timestamp,
                conv.unread_count,
                if conv.is_pinned { 1 } else { 0 },
                if conv.is_archived { 1 } else { 0 },
            ],
        )?;
        Ok(())
    }

    pub fn get_conversations(&self) -> Result<Vec<DbConversation>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, peer_fingerprint, is_group,
                    last_message_preview, last_message_timestamp,
                    unread_count, is_pinned, is_archived
             FROM conversations
             ORDER BY is_pinned DESC, last_message_timestamp DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(DbConversation {
                id: row.get(0)?,
                name: row.get(1)?,
                peer_fingerprint: row.get(2)?,
                is_group: row.get::<_, i32>(3)? != 0,
                last_message_preview: row.get(4)?,
                last_message_timestamp: row.get(5)?,
                unread_count: row.get(6)?,
                is_pinned: row.get::<_, i32>(7)? != 0,
                is_archived: row.get::<_, i32>(8)? != 0,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn save_contact(&self, contact: DbContact) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO contacts (
                fingerprint, display_name, safety_number, is_verified, added_at
            ) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                contact.fingerprint,
                contact.display_name,
                contact.safety_number,
                if contact.is_verified { 1 } else { 0 },
                contact.added_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_contacts(&self) -> Result<Vec<DbContact>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT fingerprint, display_name, safety_number, is_verified, added_at
             FROM contacts
             ORDER BY display_name ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(DbContact {
                fingerprint: row.get(0)?,
                display_name: row.get(1)?,
                safety_number: row.get(2)?,
                is_verified: row.get::<_, i32>(3)? != 0,
                added_at: row.get(4)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }
}

