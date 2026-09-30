/* Lessons 1–6 · Foundations & Indexes
 * Summaries of "Systems Design 2.0" by Jordan has no life. All credit to him. */
window.LESSONS = (window.LESSONS || []).concat([
  {
    n: 1, id: "bwt09KXDH94", duration: 521,
    title: "What is Systems Design?",
    fullTitle: "What is Systems Design? | Systems Design Interview: 0 to 1 with Google Software Engineer",
    bigIdea: "Systems design is about storing and fetching data **fast** and **reliably** once one machine is no longer enough.",
    why: "The series works from the inside out: start at the database, then move outward to app servers, caches and clients.",
    visual: {
      type: "flow",
      caption: "Clients talk to many stateless app servers; the data lives separately in a database.",
      nodes: [
        { id: "u1", label: "Client", sub: "you", x: 0, y: 0, kind: "client" },
        { id: "u2", label: "Client", sub: "everyone else", x: 0, y: 1, kind: "client" },
        { id: "a1", label: "App server", x: 1.2, y: 0 },
        { id: "a2", label: "App server", x: 1.2, y: 1 },
        { id: "db", label: "Database", sub: "source of truth", x: 2.4, y: 0.5, kind: "db" },
      ],
      edges: [
        { from: "u1", to: "a1" }, { from: "u2", to: "a2" },
        { from: "a1", to: "db" }, { from: "a2", to: "db" },
      ],
    },
    points: [
      { h: "RAM vs. hard drive", t: "RAM is fast but loses everything when the power goes out. Disk is slower but **persistent**, so the real data has to end up on disk.", analogy: "RAM is your desk (fast, but gets cleared every night); disk is the filing cabinet." },
      { h: "Don't keep data on the app server", t: "With millions of users you need many app servers. If your profile lived on server #1, anyone routed to server #2 couldn't see it. So data goes to a separate **database** that every server can ask." },
      { h: "One database eventually isn't enough", t: "You can buy a bigger machine for a while, but at some point you must **split** the data across machines and keep **backups** in case one dies." },
      { h: "The two goals", t: "Everything in this course serves two goals: make reads and writes **faster**, and make the system **fault tolerant** (it keeps working when machines fail)." },
    ],
    takeaway: "Systems design problems start when there are too many users or too much data for one machine. The rest of the course is the toolbox for fixing that.",
    terms: [
      ["Client", "The user's device making requests to your servers."],
      ["Application server", "Runs your business logic and talks to the database. Usually stateless, so you can add more of them."],
      ["Database", "The system that stores data persistently and acts as the source of truth."],
      ["Fault tolerance", "The system keeps working even if some machines fail."],
    ],
    quiz: [
      { q: "Why shouldn't user data be stored on the application server itself?", a: ["App servers don't have disks", "Requests from other users may land on a different server that doesn't have the data", "It would make the database slower", "App servers can only store data in RAM"], c: 1, why: "Once you scale out to many app servers, data must live somewhere all of them can reach." },
      { q: "Why is persistent data stored on disk rather than RAM?", a: ["Disk is faster", "RAM is lost when the machine shuts down", "RAM can't hold text", "Disk is cheaper to read randomly"], c: 1, why: "Disk survives restarts; RAM does not." },
    ],
  },
  {
    n: 2, id: "LzNdvuj3a5M", duration: 645,
    title: "Database Indexes: What Do They Do?",
    fullTitle: "Database Indexes: What do they do? | Systems Design Interview: 0 to 1 with Google Software Engineer",
    bigIdea: "An index trades **slower writes** for **much faster reads** on one key. Without one, every lookup scans the whole table: O(n).",
    visuals: [
      {
        type: "cells", title: "Without an index: scan every row",
        caption: "Finding “Shaq” means checking rows one by one. With millions of rows, that's too slow.",
        rows: [
          { label: "rows", cells: [{ t: "Jordan · 18", s: "dim" }, { t: "Donald · 7", s: "dim" }, { t: "Shaq · 24", s: "hl" }, "…", "row n"] },
        ],
      },
      {
        type: "cells", title: "Append-only log: O(1) writes, slow reads",
        caption: "Never edit in place; append a new row and read from the bottom up. Writes are fast but the table grows.",
        rows: [
          { label: "log", cells: ["Jordan · 18", { t: "Donald · 7", s: "dim" }, "Shaq · 24", { t: "Donald · 6", s: "good" }] },
          { label: "read", cells: [{ t: "← search from newest", s: "gap" }] },
        ],
      },
    ],
    points: [
      { h: "Disk likes neighbors", t: "A hard drive has a moving arm. Data that's read together should sit **next to each other** on disk, because jumping around is slow." },
      { h: "Scanning is O(n)", t: "Without structure, both reading a row and updating it require walking through every row. That's fine for 3 rows and hopeless for 300 million." },
      { h: "Appending makes writes O(1)", t: "If you only ever append new versions to the end of a file, writes are instant. But reads are still O(n), and now n is even bigger." },
      { h: "Indexes speed up reads", t: "Most big sites read far more than they write. An index lets you find rows by a key (like `name`) and run **range queries** (like “names between A and B” or “posts from the last hour”) quickly." },
    ],
    takeaway: "Index = faster reads on a specific field, paid for with slower writes. You can have several indexes, each costing extra work on every write.",
    terms: [
      ["Index", "An extra data structure that lets the database find rows by a key without scanning everything."],
      ["Range query", "A query for every key between two bounds, e.g. all posts from the last hour."],
      ["O(n) read", "Work grows with the number of rows, i.e. a full table scan."],
    ],
    quiz: [
      { q: "What's the core trade-off of adding an index?", a: ["Faster writes, slower reads", "Faster reads, slower writes", "Less disk space, slower reads", "No trade-off, it's free"], c: 1, why: "Every write must also update the index." },
      { q: "An append-only log gives you…", a: ["O(1) writes but O(n) reads", "O(1) reads and writes", "O(log n) reads", "Range queries for free"], c: 0, why: "Writes always go to the end, but you still scan to read." },
    ],
  },
  {
    n: 3, id: "I1wQsY-Nh_k", duration: 815,
    title: "How Do Hash Indexes Work?",
    fullTitle: "How do Hash Indexes work? | Systems Design Interview: 0 to 1 with Google Software Engineer",
    bigIdea: "A hash index is a hashmap from key → row location. It gives **O(1)** reads and writes, but it must fit **in RAM** and can't do **range queries**.",
    visuals: [
      {
        type: "flow", caption: "hash(key) picks a bucket; the bucket stores where the row lives on disk.",
        nodes: [
          { id: "k1", label: "“Jordan”", x: 0, y: 0, kind: "client" },
          { id: "k2", label: "“Shaq”", x: 0, y: 1, kind: "client" },
          { id: "h", label: "hash()", x: 1, y: 0.5, kind: "accent circle" },
          { id: "b4", label: "bucket 4", sub: "Jordan → disk addr\nShaq → disk addr", x: 2.1, y: 0.5, h: 1.3 },
        ],
        edges: [{ from: "k1", to: "h" }, { from: "k2", to: "h" }, { from: "h", to: "b4", label: "4" }],
      },
      {
        type: "flow", caption: "The index lives in memory; a write-ahead log on disk lets you rebuild it after a crash.",
        nodes: [
          { id: "w", label: "Write", x: 0, y: 0.5, kind: "client" },
          { id: "wal", label: "Write-ahead log", sub: "on disk · sequential", x: 1.1, y: 0, kind: "db" },
          { id: "idx", label: "Hash index", sub: "in RAM", x: 1.1, y: 1, kind: "accent" },
        ],
        edges: [{ from: "w", to: "wal", label: "1" }, { from: "w", to: "idx", label: "2" }, { from: "wal", to: "idx", label: "replay\non crash", style: "dash", bend: 40 }],
      },
    ],
    points: [
      { h: "Hashmap refresher", t: "A hash function always maps the same key to the same bucket. Collisions are handled by **chaining** (a list per bucket) or **probing** (try the next slot). On average, O(1)." },
      { h: "Bad on disk, so keep it in RAM", t: "Hashing spreads keys randomly by design, which means random jumps on disk. So hash indexes live in memory, and **all keys must fit in RAM**." },
      { h: "Durability via a write-ahead log", t: "RAM is wiped on a crash. Every change is first appended to a **write-ahead log (WAL)** on disk (sequential, so fairly fast). After a crash, replay the log to rebuild the index." },
      { h: "No range queries", t: "“All names between A and B” would mean checking every possible key or scanning every bucket, so you're back to O(n). A sorted structure (a tree) is needed for ranges." },
    ],
    takeaway: "Use a hash index when the key set is small enough for memory and you only need single-key lookups. It's the fastest option, but it has no range queries.",
    terms: [
      ["Hash function", "Deterministically maps a key to a number (bucket)."],
      ["Write-ahead log (WAL)", "An append-only file on disk recording every change before it's applied, used to recover state after a crash."],
      ["Chaining / probing", "Two ways to handle two keys hashing to the same bucket."],
    ],
    quiz: [
      { q: "Why are hash indexes kept in memory?", a: ["Hash functions only run in RAM", "Hashing scatters keys, causing slow random disk access", "Disks can't store hashmaps", "To support range queries"], c: 1, why: "The hash spreads keys evenly, which is bad for a spinning disk." },
      { q: "Which query is a hash index bad at?", a: ["Find user with id = 42", "Find all users with names between A and B", "Update the row for “Jordan”", "Check whether a key exists"], c: 1, why: "Range queries need sorted order, and hashing destroys order." },
      { q: "What makes an in-memory index durable?", a: ["A bloom filter", "A write-ahead log on disk", "Bigger RAM", "Chaining"], c: 1, why: "Replay the WAL to rebuild the index after a crash." },
    ],
  },
  {
    n: 4, id: "Z2OaqmxiH20", duration: 552,
    title: "How Do B-Tree Indexes Work?",
    fullTitle: "How do B-Tree Indexes work? | Systems Design Interview: 0 to 1 with Google Software Engineer",
    bigIdea: "A B-tree is a **balanced, sorted tree stored on disk**. It handles huge datasets and **range queries**, but writes are slower.",
    visuals: [
      {
        type: "flow", caption: "Each page covers a key range and points to child pages. Only a few disk hops are needed, even for huge tables.",
        nodes: [
          { id: "r", label: "A–L | L–Z", sub: "root page", x: 1, y: 0, kind: "accent" },
          { id: "c1", label: "A–E | E–L", x: 0.4, y: 1 },
          { id: "c2", label: "L–R | R–Z", x: 1.8, y: 1 },
          { id: "l1", label: "Adam 71\nBob 88", x: 0, y: 2, kind: "db" },
          { id: "l2", label: "Edward 80\nGordon 95", x: 1, y: 2, kind: "db" },
          { id: "l3", label: "…", x: 2, y: 2, kind: "ghost" },
        ],
        edges: [{ from: "r", to: "c1" }, { from: "r", to: "c2" }, { from: "c1", to: "l1" }, { from: "c1", to: "l2" }, { from: "c2", to: "l3" }],
        colW: 138, nodeW: 120, noFlip: true,
              },
      {
        type: "steps", title: "Inserting when a page is full",
        items: [
          ["Find the leaf page", "Walk down the tree by key range."],
          ["Leaf has room?", "Rewrite that page with the key in sorted order. Done."],
          ["Leaf is full → split it", "Split into two pages and add a new boundary to the parent."],
          ["Parent full too?", "Keep splitting upward. If the root splits, a new root is created, so the tree stays balanced."],
        ],
      },
    ],
    points: [
      { h: "Lives on disk", t: "Unlike a hash index, the B-tree doesn't need all keys in RAM, so dataset size is limited only by disk." },
      { h: "Few hops thanks to big pages", t: "Pages are large and the tree stays **balanced**, so it's short. A read is only a handful of disk jumps." },
      { h: "Range queries are natural", t: "Neighboring keys live in the same leaf pages. “All names from E to L” means walking down once and reading adjacent data." },
      { h: "Writes are the cost", t: "A write may rewrite a leaf, split pages and update parents all the way to the root, plus a **WAL** entry so a crash mid-split can be recovered." },
    ],
    takeaway: "B-trees are the default index of most relational databases: good reads, range queries, and big datasets, but slower writes.",
    terms: [
      ["B-tree", "A self-balancing tree of fixed-size pages on disk, keyed by ranges."],
      ["Page split", "When a page is full, it's split in two and the parent gets a new pointer."],
    ],
    quiz: [
      { q: "What's the main advantage of a B-tree over a hash index?", a: ["O(1) writes", "Supports range queries and datasets larger than RAM", "No write-ahead log needed", "Faster single-key reads"], c: 1, why: "It's sorted and lives on disk." },
      { q: "Why do B-tree writes tend to be slow?", a: ["They're in memory", "They may cascade page splits up the tree on disk", "They need a bloom filter", "They rebuild the whole tree"], c: 1, why: "Inserting into full pages triggers splits and pointer updates on disk." },
    ],
  },
  {
    n: 5, id: "ciGAVER_erw", duration: 935,
    title: "LSM Trees + SSTables",
    fullTitle: "LSM Tree + SSTable Database Indexes | Systems Design Interview: 0 to 1 with Google Software Engineer",
    bigIdea: "LSM trees buffer writes in an in-memory sorted tree, then flush it to **immutable sorted files (SSTables)**. **Fast writes**, decent reads, and range queries.",
    visuals: [
      {
        type: "flow", caption: "Writes hit memory (plus a WAL). Full memtables become SSTables. Reads check newest → oldest.",
        nodes: [
          { id: "w", label: "Writes", x: 0, y: 0, kind: "client" },
          { id: "wal", label: "WAL", sub: "disk", x: 1, y: 0, kind: "db" },
          { id: "m", label: "Memtable", sub: "balanced BST in RAM", x: 0, y: 1, kind: "accent" },
          { id: "s1", label: "SSTable 3", sub: "newest", x: 0, y: 2, kind: "db" },
          { id: "s2", label: "SSTable 2", x: 0, y: 3, kind: "db" },
          { id: "s3", label: "SSTable 1", sub: "oldest", x: 0, y: 4, kind: "db" },
          { id: "c", label: "Compaction", sub: "merge + drop old", x: 1, y: 3.5, kind: "good" },
        ],
        edges: [
          { from: "w", to: "m" }, { from: "w", to: "wal", style: "dash" },
          { from: "m", to: "s1", label: "flush" },
          { from: "s2", to: "c", style: "dash" }, { from: "s3", to: "c", style: "dash" },
        ],
      },
      {
        type: "cells", title: "Compaction = merge two sorted lists",
        caption: "Newer value wins (Alex 93 beats Alex 91). A tombstone ✝ marks a delete.",
        rows: [
          { label: "newer", cells: [{ t: "Alex 93", s: "good" }, "Bob 70", "Charlie 85"] },
          { label: "older", cells: [{ t: "Alex 91", s: "dim" }, "Dan 60", "Ed 77"] },
          { label: "merged", cells: [{ t: "Alex 93", s: "hl" }, { t: "Bob 70", s: "hl" }, { t: "Charlie 85", s: "hl" }, { t: "Dan 60", s: "hl" }, { t: "Ed 77", s: "hl" }] },
        ],
      },
    ],
    points: [
      { h: "Write to memory first", t: "Writes go to an in-memory balanced BST (the **memtable**), plus a WAL for durability. That's O(log n) in RAM, much faster than a B-tree write on disk." },
      { h: "Flush to SSTables", t: "When the memtable is too big, an **in-order traversal** (linear time) writes it to disk as a sorted, **immutable** SSTable file." },
      { h: "Reading checks many places", t: "Look in the memtable, then SSTables from newest to oldest. The first hit wins. Deletes are **tombstones**. Each SSTable is sorted, so binary search works." },
      { h: "Read optimizations", t: "A **sparse index** stores a few keys' offsets to narrow the binary search. A **Bloom filter** can say “definitely not in this file”, so you skip it." },
      { h: "Compaction", t: "Updates leave old copies behind. Background **compaction** merges SSTables (like merging sorted lists), keeping only the newest values. It costs background CPU." },
    ],
    takeaway: "Hash index: fastest, RAM-only, no ranges. B-tree: great reads and ranges, slower writes. LSM tree: faster writes than a B-tree, ranges supported, but reads may touch several files.",
    terms: [
      ["Memtable", "The in-memory sorted tree that absorbs writes in an LSM engine."],
      ["SSTable", "Sorted String Table: an immutable, sorted file on disk."],
      ["Tombstone", "A special marker meaning “this key was deleted”."],
      ["Bloom filter", "A small probabilistic structure that can answer “definitely not present” quickly."],
      ["Compaction", "Merging SSTables in the background to drop stale values and save space."],
    ],
    quiz: [
      { q: "Why are LSM-tree writes faster than B-tree writes?", a: ["They skip durability", "They go to an in-memory tree (plus a sequential WAL) instead of random disk pages", "They don't sort data", "They use hashing"], c: 1, why: "Memory writes and sequential appends are cheap." },
      { q: "A key appears in SSTable 1 (older) and SSTable 3 (newer). Which value is returned?", a: ["SSTable 1", "SSTable 3", "Both", "Neither, it's a conflict"], c: 1, why: "SSTables are immutable, so the newest version wins." },
      { q: "What does a Bloom filter tell you?", a: ["The exact location of a key", "That a key is definitely NOT in a file", "That a key is definitely in a file", "The key's latest value"], c: 1, why: "“No” is certain; “maybe” can be a false positive." },
    ],
  },
  {
    n: 6, id: "QO7KTO-8RWM", duration: 422,
    title: "Indexes Concluded",
    fullTitle: "Indexes Concluded | Systems Design Interview: 0 to 1 with Google Software Engineer",
    bigIdea: "Think of an index as **sorting the table by a key**. Then choose how much row data to copy into it, and whether to sort by **several fields at once**.",
    visuals: [
      {
        type: "table", title: "What does the index store?",
        head: ["Type", "Index holds", "Trade-off"],
        rows: [
          ["Clustered", "The full row", "Fastest reads, but data is duplicated in every such index"],
          ["Non-clustered", "Pointer to the row on disk", "Less duplication, one extra hop"],
          ["Covering", "Some columns + pointer", "Middle ground: fast for the columns you include"],
        ],
      },
      {
        type: "cells", title: "Composite index on (name, date)",
        caption: "Sorted by name first, then by date within each name. That's one sort order, not two separate indexes.",
        rows: [
          { label: "alice", cells: [{ t: "Jan 1", s: "hl" }, { t: "Mar 10", s: "hl" }, { t: "Sep 10", s: "hl" }] },
          { label: "bob", cells: [{ t: "Feb 5", s: "good" }, { t: "Jun 1", s: "good" }] },
          { label: "carol", cells: ["Dec 1"] },
        ],
      },
    ],
    points: [
      { h: "Index = sorted order", t: "Abstractly, indexing a column means keeping the data sorted by that column, so single lookups and range queries become O(log n) binary searches." },
      { h: "Clustered vs. non-clustered", t: "Storing the whole row in the index is fast, but with multiple indexes you'd copy every row many times. Most indexes store a **disk address** instead." },
      { h: "Covering indexes", t: "Include just the extra columns your hot query needs, so it can be answered from the index alone." },
      { h: "Composite (multi-column) indexes", t: "An index on `(user, date)` sorts by user, then by date within each user. That's perfect for “this user's posts, newest first”." },
    ],
    takeaway: "Pick index columns from your read patterns. Composite indexes serve “filter by A, then sort/range by B” queries in a single sorted scan.",
    interview: "When you define a table, say which index you'd put on it and why, e.g. “index posts on (userId, timestamp) so fetching a user's recent posts is one range scan”.",
    terms: [
      ["Clustered index", "The row data itself is stored in index order."],
      ["Covering index", "An index that includes enough columns to answer a query without touching the main table."],
      ["Composite index", "An index sorted by multiple columns in a fixed order."],
    ],
    quiz: [
      { q: "Why do most secondary indexes store a pointer instead of the full row?", a: ["Pointers are faster to read", "To avoid duplicating every row in every index", "Rows can't be sorted", "Because of the WAL"], c: 1, why: "Multiple clustered indexes would multiply storage." },
      { q: "An index on (name, date) is best for…", a: ["All posts on a given date across users", "One user's posts in a date range", "Full-text search", "Counting all rows"], c: 1, why: "Within each name, rows are sorted by date." },
    ],
  },
]);
