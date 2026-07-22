import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

export interface SeedOptions {
  configDir: string;
  threadCount?: number;
  messagesPerThread?: number;
}

function generateId(): string {
  return crypto.randomBytes(12).toString('hex').slice(0, 22);
}

function createTablesIfNeeded(db: Database.Database) {
  // Create tables with minimal schema to match Mailspring's actual schema
  // Mailspring stores models as JSON in a 'data' column

  const tables = [
    `CREATE TABLE IF NOT EXISTS Account (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS Folder (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS Thread (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS Message (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )`,
  ];

  for (const sql of tables) {
    db.exec(sql);
  }
}

export async function seedAccount(options: SeedOptions) {
  const { configDir, threadCount = 25, messagesPerThread = 2 } = options;
  const dbPath = path.join(configDir, 'edgehill.db');

  // Create config dir if needed
  fs.mkdirSync(configDir, { recursive: true });

  const db = new Database(dbPath);

  try {
    // Enable WAL mode
    db.pragma('journal_mode = WAL');
    db.pragma('main.page_size = 8192');
    db.pragma('main.cache_size = 20000');
    db.pragma('main.synchronous = NORMAL');

    // Create tables if they don't exist
    createTablesIfNeeded(db);

    const accountId = generateId();
    const inboxFolderId = generateId();

    // Start transaction for faster inserts
    const transaction = db.transaction(() => {
      // Create Account
      const accountStmt = db.prepare(`
        INSERT OR REPLACE INTO Account (id, data)
        VALUES (?, ?)
      `);

      const accountData = {
        __cls: 'Account',
        id: accountId,
        aid: accountId,
        name: 'Benchmark Account',
        provider: 'generic',
        emailAddress: 'benchmark@example.com',
        settings: {
          imap_host: 'localhost',
          imap_port: 993,
          imap_username: 'benchmark@example.com',
          imap_password: 'password',
          imap_allow_insecure_ssl: true,
          imap_security: 'SSL / TLS',
          smtp_host: 'localhost',
          smtp_port: 587,
          smtp_username: 'benchmark@example.com',
          smtp_password: 'password',
          smtp_allow_insecure_ssl: true,
          smtp_security: 'STARTTLS',
        },
        label: 'Benchmark Account',
        aliases: [],
        autoaddress: { type: 'bcc', value: '' },
        defaultAlias: '',
        syncState: 'ok',
        syncError: null,
        color: '#0084D0',
        authedAt: new Date(0).getTime() / 1000,
        v: 1,
      };

      accountStmt.run(accountId, JSON.stringify(accountData));

      // Create Inbox folder
      const folderStmt = db.prepare(`
        INSERT OR REPLACE INTO Folder (id, data)
        VALUES (?, ?)
      `);

      const folderData = {
        __cls: 'Folder',
        id: inboxFolderId,
        aid: inboxFolderId,
        accountId: accountId,
        displayName: 'Inbox',
        name: 'inbox',
        v: 1,
      };

      folderStmt.run(inboxFolderId, JSON.stringify(folderData));

      // Create threads and messages
      const threadStmt = db.prepare(`
        INSERT OR REPLACE INTO Thread (id, data)
        VALUES (?, ?)
      `);

      const messageStmt = db.prepare(`
        INSERT OR REPLACE INTO Message (id, data)
        VALUES (?, ?)
      `);

      const now = Math.floor(Date.now() / 1000);

      for (let i = 0; i < threadCount; i++) {
        const threadId = generateId();
        const timestamp = now - i * 3600; // Stagger by 1 hour

        // Create thread
        const subject = `Benchmark Thread ${i + 1}`;
        const snippet = `This is a snippet of message ${i + 1}`;

        const threadData = {
          __cls: 'Thread',
          id: threadId,
          aid: threadId,
          accountId: accountId,
          subject: subject,
          snippet: snippet,
          unread: i % 5 === 0, // Make some unread for realism
          starred: i % 10 === 0, // Make some starred
          v: 1,
          folders: [{ id: inboxFolderId, name: 'inbox', displayName: 'Inbox' }],
          labels: [],
          categories: [{ id: inboxFolderId, name: 'inbox', displayName: 'Inbox' }],
          participants: [
            { name: 'Sender', email: `sender${i}@example.com` },
            { name: 'Recipient', email: 'benchmark@example.com' },
          ],
          attachmentCount: 0,
          firstMessageTimestamp: timestamp,
          lastMessageReceivedTimestamp: timestamp,
          lastMessageSentTimestamp: timestamp,
          inAllMail: true,
        };

        threadStmt.run(threadId, JSON.stringify(threadData));

        // Create messages in thread
        for (let j = 0; j < messagesPerThread; j++) {
          const messageId = generateId();
          const msgTimestamp = timestamp + j * 60;

          const messageData = {
            __cls: 'Message',
            id: messageId,
            aid: messageId,
            accountId: accountId,
            threadId: threadId,
            subject: subject,
            snippet: snippet,
            unread: i % 5 === 0 && j === 0, // Only first message can be unread
            starred: i % 10 === 0,
            date: msgTimestamp,
            v: 1,
            folders: [{ id: inboxFolderId, name: 'inbox', displayName: 'Inbox' }],
            from: [{ name: 'Sender', email: `sender${i}@example.com` }],
            to: [{ name: 'Recipient', email: 'benchmark@example.com' }],
            cc: [],
            bcc: [],
            replyTo: [],
            files: [],
            events: [],
            draft: false,
          };

          messageStmt.run(messageId, JSON.stringify(messageData));
        }
      }
    });

    transaction();
    console.log(`✓ Seeded database with ${threadCount} threads`);
  } catch (err) {
    console.error('Failed to seed database:', err);
    throw err;
  } finally {
    db.close();
  }
}
