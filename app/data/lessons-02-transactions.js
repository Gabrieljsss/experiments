/* Lessons 7–15 · Transactions, Isolation, Storage & Encoding
 * Summaries of "Systems Design 2.0" by Jordan has no life. All credit to him. */
window.LESSONS = (window.LESSONS || []).concat([
  {
    n: 7, id: "oGmxzUBCYtY", duration: 469,
    title: "Intro to ACID Transactions",
    fullTitle: "Intro to ACID Database Transactions | Systems Design Interview: 0 to 1 with Google Software Engineer",
    bigIdea: "A transaction groups writes so the database can promise **A**tomicity, **C**onsistency, **I**solation and **D**urability.",
    visuals: [
      {
        type: "cards",
        items: [
          { icon: "⚛️", title: "Atomicity", text: "All writes in the transaction succeed, or none do." },
          { icon: "✅", title: "Consistency", text: "A failure never leaves the data corrupted or breaking its rules." },
          { icon: "🧍", title: "Isolation", text: "Concurrent transactions behave as if they ran one at a time: no race conditions." },
          { icon: "💾", title: "Durability", text: "Once committed, data survives crashes (it's on disk)." },
        ],
      },
      {
        type: "lanes", title: "The classic race: two increments, one lost",
        lanes: ["Me", "Friend", "counter"],
        rows: [
          ["read 0", "read 0", "0"],
          ["0 + 1", "0 + 1", ""],
          ["write 1", "", "1"],
          ["", "write 1", { t: "1 (should be 2!)", s: "bad" }],
        ],
      },
    ],
    points: [
      { h: "Atomicity", t: "Sending $10 means “subtract from me” AND “add to them”. If only one half happens, money appears or vanishes. Both writes must succeed or fail **together**." },
      { h: "Consistency", t: "Invariants still hold after a failure (e.g. “there's always one guard on shift”). Enforcing atomicity is mostly what gives you this." },
      { h: "Isolation is the hard one", t: "Databases are multi-threaded. Without isolation, two people incrementing a counter at once can lose an update. Full isolation is possible, but it's **expensive**." },
      { h: "A, C and D come from the WAL", t: "Write each transaction's changes to the write-ahead log, then a **commit** marker. On crash, replay only committed blocks, so nothing is half-applied." },
    ],
    takeaway: "ACID is an abstraction a database may offer. Not every database does, because full isolation costs performance. The next lessons show the weaker levels and how full isolation is built.",
    terms: [
      ["Transaction", "A group of reads/writes the database treats as one unit."],
      ["Commit", "The point where a transaction's writes become permanent and visible."],
      ["Race condition", "A bug where the result depends on the timing of concurrent operations."],
    ],
    quiz: [
      { q: "A bank transfer debits A but crashes before crediting B. Which ACID property prevents this?", a: ["Isolation", "Atomicity", "Durability", "Consistency only"], c: 1, why: "All-or-nothing." },
      { q: "Which property is the hardest to provide efficiently?", a: ["Atomicity", "Consistency", "Isolation", "Durability"], c: 2, why: "Preventing all race conditions slows the database down." },
      { q: "How does a WAL help with atomicity?", a: ["It locks rows", "Only transactions with a commit marker get replayed after a crash", "It caches reads", "It compresses data"], c: 1, why: "Uncommitted blocks are discarded." },
    ],
  },
  {
    n: 8, id: "oS60pr8H1e0", duration: 571,
    title: "Read Committed Isolation",
    fullTitle: "Read Committed Isolation | Systems Design Interview: 0 to 1 with Google Software Engineer",
    bigIdea: "**Read committed** prevents two races: **dirty writes** (overwriting uncommitted data) and **dirty reads** (seeing uncommitted data).",
    visuals: [
      {
        type: "lanes", title: "Dirty write: two purchases interleave",
        caption: "Donald “wins” the purchase but the item ships to Jordan's address. Mixed, inconsistent state.",
        lanes: ["T1 (Jordan)", "T2 (Donald)"],
        rows: [
          ["purchaser = Jordan", ""],
          ["", "purchaser = Donald"],
          ["", "address = White House"],
          ["address = Jordan's", ""],
          [{ t: "commit", s: "bad" }, { t: "commit", s: "bad" }],
        ],
      },
      {
        type: "lanes", title: "Dirty read: seeing a write that later fails",
        lanes: ["T1 (transfer)", "T2 (check balance)"],
        rows: [
          ["Jordan −$10", ""],
          ["", { t: "reads −$10 ‼️", s: "bad" }],
          [{ t: "credit fails → abort", s: "bad" }, ""],
        ],
      },
    ],
    points: [
      { h: "Dirty writes → row locks", t: "A writer must hold the row's **lock** until commit, so nobody overwrites uncommitted data. To avoid **deadlocks**, grab locks in a consistent order, or let the database detect deadlocks and abort one transaction." },
      { h: "Dirty reads → keep the old value", t: "Locking readers would be slow, since one slow write would block many reads. Instead the database keeps the **old committed value** and serves it until the new one commits." },
      { h: "That's read committed", t: "Any database that prevents both dirty writes and dirty reads offers **read committed** isolation. It's common, but other races (next lessons) still get through." },
    ],
    takeaway: "Read committed = row locks for writers + remember the last committed value for readers.",
    terms: [
      ["Dirty write", "Overwriting another transaction's uncommitted value."],
      ["Dirty read", "Reading another transaction's uncommitted value."],
      ["Deadlock", "Two transactions each wait for a lock the other holds, forever."],
    ],
    quiz: [
      { q: "How does read committed usually prevent dirty reads without making readers wait?", a: ["Readers take exclusive locks", "The DB returns the last committed value until the new one commits", "Reads go to a replica", "It uses a Bloom filter"], c: 1, why: "Storing one extra value avoids blocking reads." },
      { q: "What prevents dirty writes?", a: ["Row-level locks held until commit", "Snapshots", "Compaction", "Indexes"], c: 0, why: "Only the lock holder can write that row." },
    ],
  },
  {
    n: 9, id: "Tgpa9TrxsfU", duration: 428,
    title: "Snapshot Isolation",
    fullTitle: "Snapshot Isolation | Systems Design Interview: 0 to 1 with Google Software Engineer",
    bigIdea: "Long reads can see a **mix of before and after** a write (read skew). Snapshot isolation keeps old versions tagged by transaction number, so a read sees one **consistent point in time**.",
    visuals: [
      {
        type: "lanes", title: "Read skew: the family total “loses” $100K",
        caption: "Every value read was committed, but the reader saw Caitlyn before the transfer and Kris after it.",
        lanes: ["Long analytics read", "Transfer"],
        rows: [
          ["read Caitlyn = 100K", ""],
          ["read Kylie, Kendall…", ""],
          ["", "Kris → Caitlyn 100K (commit)"],
          ["read Kris = 0", ""],
          [{ t: "sum = 900K ≠ 1M", s: "bad" }, ""],
        ],
      },
      {
        type: "cells", title: "Multi-version rows: view the DB “as of T15”",
        caption: "Ignore versions after 15; take the newest one at or before 15. Kris didn't exist yet.",
        rows: [
          { label: "Caitlyn", cells: [{ t: "T1: 100K", s: "dim" }, { t: "T6: 300K", s: "dim" }, { t: "T12: 200K", s: "hl" }] },
          { label: "Kendall", cells: [{ t: "T15: 1M", s: "hl" }] },
          { label: "Kris", cells: [{ t: "T22: created", s: "bad" }] },
          { label: "Lamar", cells: [{ t: "T3: 100K", s: "hl" }] },
        ],
      },
    ],
    points: [
      { h: "Read skew (non-repeatable read)", t: "A long read (e.g. an analytics query over every row) interleaves with a committed write and sees an invariant that looks broken, even though no dirty data was read." },
      { h: "Order transactions by the WAL", t: "Every transaction that hits the write-ahead log gets a **monotonically increasing** sequence number." },
      { h: "Keep old versions", t: "When a value is overwritten, keep the old one tagged with the writer's transaction number. A reader at T15 picks, for each row, the newest version written at or before T15." },
      { h: "Cheap enough", t: "Versions exist only for rows that actually changed, so the storage cost is modest, and long reads never block writers." },
    ],
    takeaway: "Snapshot isolation = multi-version rows + transaction IDs, so every read sees a consistent snapshot.",
    terms: [
      ["Read skew", "Seeing different parts of the database at different points in time."],
      ["Snapshot", "A consistent view of the database as of one transaction number."],
      ["MVCC", "Multi-version concurrency control: keeping several versions of each row."],
    ],
    quiz: [
      { q: "A backup job reads all rows while transfers run and finds the totals don't add up. This is…", a: ["A dirty write", "Read skew", "A deadlock", "A phantom"], c: 1, why: "Each value was committed, but they came from different moments." },
      { q: "In snapshot isolation, reading “as of T15”, which Caitlyn value do you see if versions exist at T6, T12 and T17?", a: ["T6", "T12", "T17", "All three"], c: 1, why: "The newest version at or before 15." },
    ],
  },
  {
    n: 10, id: "eym48yrObhY", duration: 398,
    title: "Write Skew & Phantom Writes",
    fullTitle: "Write Skew and Phantom Writes | Systems Design Interview: 0 to 1 with Google Software Engineer",
    bigIdea: "Two transactions can each write a **different row** yet together break a rule (write skew). If the conflicting rows **don't exist yet**, there's nothing to lock (phantoms).",
    visuals: [
      {
        type: "lanes", title: "Write skew: “at least one doctor on call”",
        lanes: ["Dr. Oz", "Dr. Toboggan"],
        rows: [
          ["sees 2 active ✓", "sees 2 active ✓"],
          ["set self inactive", "set self inactive"],
          [{ t: "0 doctors active", s: "bad" }, { t: "0 doctors active", s: "bad" }],
        ],
      },
      {
        type: "flow", title: "Fix for phantoms: materialize the conflict",
        caption: "Pre-create a row per claimable item so there's a lock to fight over.",
        nodes: [
          { id: "j", label: "Jordan", sub: "wants cupcake", x: 0, y: 0, kind: "client" },
          { id: "d", label: "Donald", sub: "wants cupcake", x: 0, y: 1, kind: "client" },
          { id: "r", label: "cupcake row", sub: "pre-created + lock", x: 1.3, y: 0.5, kind: "db" },
        ],
        edges: [{ from: "j", to: "r", label: "gets lock", style: "good" }, { from: "d", to: "r", label: "waits / fails", style: "bad dash" }],
      },
    ],
    points: [
      { h: "Lost updates (recap)", t: "Two read-modify-writes on the **same** row, e.g. a counter. The fix is simple: lock the row." },
      { h: "Write skew", t: "Each doctor only locks their **own** row, so the locks never collide, yet the shared invariant breaks. Fix: lock **every row the decision depends on** (all active doctors)." },
      { h: "Phantoms", t: "Two people both claim the cupcake by **inserting** new rows. Locks on existing rows can't help because the conflicting row didn't exist when they checked." },
      { h: "Materialize conflicts", t: "Pre-populate a row for each claimable thing, so claiming means updating a row, and that row has a lock." },
    ],
    takeaway: "Write skew: lock all the rows your check read. Phantoms: create rows up front so there's something to lock.",
    terms: [
      ["Write skew", "Concurrent transactions update different rows based on a shared premise that stops being true."],
      ["Phantom", "A concurrent insert changes the result of another transaction's search condition."],
      ["Materializing conflicts", "Creating placeholder rows so conflicts become lockable."],
    ],
    quiz: [
      { q: "Why don't per-row locks stop the doctors' write skew?", a: ["Locks are too slow", "Each doctor writes a different row, so the locks never conflict", "Doctors don't use transactions", "The DB is read committed"], c: 1, why: "The invariant spans multiple rows." },
      { q: "What makes a phantom special?", a: ["It reads uncommitted data", "The conflicting row doesn't exist yet, so there's nothing to lock", "It only happens with indexes", "It's caused by replication"], c: 1, why: "Inserts can't be protected by locks on existing rows." },
    ],
  },
  {
    n: 11, id: "kN_rOaNZBng", duration: 365,
    title: "Achieving ACID: Serial Execution",
    fullTitle: "Achieving ACID: Serial Execution | Systems Design Interview: 0 to 1 with Google Software Engineer",
    bigIdea: "The simplest way to get full isolation: literally run transactions **one at a time on one core**, then make each one as fast as possible.",
    visual: {
      type: "flow", caption: "One thread, one queue. Anything slow (disk, network) delays everyone behind it.",
      nodes: [
        { id: "q", label: "Tx queue", sub: "T1 T2 T3 …", x: 0, y: 0.5, kind: "client" },
        { id: "c", label: "Single core", sub: "runs one at a time", x: 1.2, y: 0.5, kind: "accent" },
        { id: "m", label: "Data in RAM", sub: "hash / tree index", x: 2.4, y: 0, kind: "db" },
        { id: "sp", label: "Stored procs", sub: "pre-loaded logic", x: 2.4, y: 1, kind: "good" },
      ],
      edges: [{ from: "q", to: "c" }, { from: "c", to: "m" }, { from: "c", to: "sp", style: "dash" }],
    },
    points: [
      { h: "Why it's viable now", t: "CPUs got fast enough that a single thread can handle many workloads. No concurrency means no race conditions. (VoltDB does exactly this.)" },
      { h: "Keep data in memory", t: "Disk would stall the one thread. In-memory storage is fast but costs more and holds less, and durability again needs a WAL." },
      { h: "Use stored procedures", t: "Shipping a whole SQL script over the network per call is slow. Pre-register the logic on the DB and send only parameters (e.g. `productId, qty`)." },
      { h: "The downside of stored procedures", t: "They live in the database, so they're awkward to version-control, test and deploy across replicas." },
    ],
    takeaway: "Serial execution: true isolation with no locks, but throughput is capped by one core and every slow step hurts everyone.",
    terms: [
      ["Actual serial execution", "Running every transaction sequentially on a single thread."],
      ["Stored procedure", "Code registered inside the database and invoked by name with parameters."],
    ],
    quiz: [
      { q: "Why do serial-execution databases keep data in memory?", a: ["For range queries", "Disk I/O would block the single thread and every queued transaction", "Memory is cheaper", "To avoid needing a WAL"], c: 1, why: "Any slow step delays the whole queue." },
      { q: "What do stored procedures reduce?", a: ["Disk usage", "Data sent over the network per transaction", "Number of indexes", "Replication lag"], c: 1, why: "Only parameters are sent." },
    ],
  },
  {
    n: 12, id: "gB7qazeSD3k", duration: 631,
    title: "Two-Phase Locking (2PL)",
    fullTitle: "Database Internals: Two Phase Locking | Systems Design Interview: 0 to 1 with Ex-Google SWE",
    bigIdea: "2PL gives full isolation with **shared (read)** and **exclusive (write)** locks. It's correct but slow: lots of locking and frequent **deadlocks**.",
    visuals: [
      {
        type: "table", title: "Lock compatibility",
        head: ["Held \\ Wanted", "Shared (read)", "Exclusive (write)"],
        rows: [["Shared", "Yes, many readers", "No, wait for readers"], ["Exclusive", "No", "No"]],
      },
      {
        type: "lanes", title: "Deadlock: both read each other's cart, then both write",
        lanes: ["Jordan's tx", "Snoop's tx"],
        rows: [
          ["read-lock Jordan", "read-lock Snoop"],
          ["read-lock Snoop", "read-lock Jordan"],
          [{ t: "want write-lock Jordan ⏳", s: "bad" }, { t: "want write-lock Snoop ⏳", s: "bad" }],
          [{ t: "DB detects → abort one", s: "muted" }, ""],
        ],
      },
    ],
    points: [
      { h: "Shared vs. exclusive", t: "Many transactions may hold a row's lock in **read mode**. To write, you must upgrade to **exclusive** mode, which waits until all readers leave. What you read can't change under you." },
      { h: "Deadlocks are the big cost", t: "Even with consistent ordering, read-then-upgrade patterns deadlock. The DB must detect them, abort a transaction and retry it." },
      { h: "Predicate locks for phantoms", t: "Lock “all rows matching `class = 'flex' AND time = 6pm`”, including ones that don't exist yet. This is correct but slow to evaluate without a matching index." },
      { h: "Index-range locks", t: "Lock a **superset** that's cheap to find via an index (e.g. every row for class 'flex'). Faster to compute, but may block unrelated transactions." },
    ],
    takeaway: "2PL is pessimistic: it assumes conflicts and locks defensively. It's used in many traditional SQL databases.",
    terms: [
      ["Two-phase locking", "Take shared locks to read and exclusive locks to write, and hold them until the transaction ends."],
      ["Predicate lock", "A lock on every row matching a condition, including future rows."],
      ["Index-range lock", "A coarser lock over an index range that covers the predicate."],
    ],
    quiz: [
      { q: "In 2PL, can two transactions read the same row at once?", a: ["Yes, with shared locks", "No, never", "Only on replicas", "Only with SSI"], c: 0, why: "Shared locks are compatible with each other." },
      { q: "Why use an index-range lock instead of a predicate lock?", a: ["It's more precise", "It's faster to compute, at the cost of locking extra rows", "It avoids deadlocks entirely", "It works without transactions"], c: 1, why: "Cheaper to find, but coarser." },
    ],
  },
  {
    n: 13, id: "4TAKYRzm_dA", duration: 508,
    title: "Serializable Snapshot Isolation (SSI)",
    fullTitle: "Serializable Snapshot Isolation | Systems Design Interview: 0 to 1 with Ex-Google SWE",
    bigIdea: "SSI is **optimistic**: run on a snapshot with no locks, track what each transaction read, and **abort** it at commit if its premise changed.",
    visuals: [
      {
        type: "lanes", title: "Case 1: you ignored an uncommitted write that then commits",
        lanes: ["T19", "T20 (me)"],
        rows: [
          ["Kate.likesMe = false (uncommitted)", ""],
          ["", "read Kate = true, note pending write"],
          [{ t: "commit", s: "good" }, ""],
          ["", { t: "at commit: premise stale → abort", s: "bad" }],
        ],
      },
      {
        type: "table", title: "Optimistic vs. pessimistic",
        head: ["", "SSI (optimistic)", "2PL (pessimistic)"],
        rows: [
          ["Locks", "None", "Everywhere"],
          ["Low contention", "Yes, fast", "Wasted locking"],
          ["High contention (hot counter)", "No, constant aborts", "Yes, better"],
        ],
      },
    ],
    points: [
      { h: "Most transactions don't collide", t: "Your profile post and mine don't interact, so locking them is wasted work. Optimistic control just runs them." },
      { h: "Case 1: stale read of a pending write", t: "If you read a row that had an **uncommitted write**, check again at commit time. If that write committed, abort and retry." },
      { h: "Case 2: someone writes after you read", t: "Rows remember which in-flight transactions read them. When a new write commits, every dependent transaction is **aborted**." },
      { h: "When not to use it", t: "Under heavy contention (everyone incrementing the same counter) nearly every transaction aborts. Use 2PL there." },
    ],
    takeaway: "SSI: lock-free, snapshot-based and abort-on-conflict. Great when conflicts are rare, bad when they're constant.",
    terms: [
      ["Optimistic concurrency control", "Proceed without locks and detect conflicts at commit."],
      ["Pessimistic concurrency control", "Lock up front assuming conflicts will happen."],
    ],
    quiz: [
      { q: "SSI performs worst when…", a: ["Transactions rarely touch the same rows", "Many transactions update the same hot row", "Reads dominate", "Data fits in memory"], c: 1, why: "High contention means lots of aborts and retries." },
      { q: "What does SSI do instead of taking locks?", a: ["Runs on one core", "Tracks reads and aborts transactions whose premise changed", "Uses predicate locks", "Uses quorums"], c: 1, why: "Detect, then abort and retry." },
    ],
  },
  {
    n: 14, id: "Zt7rqtJ3uWA", duration: 783,
    title: "Column-Oriented Storage (Parquet)",
    fullTitle: "Column Oriented Storage (with Parquet!) | Systems Design Interview: 0 to 1 with Ex-Google SWE",
    bigIdea: "Store each **column** together instead of each row. Analytics scans one column fast, compresses extremely well, and can skip whole chunks.",
    visuals: [
      {
        type: "cells", title: "Row vs. column layout on disk",
        rows: [
          { label: "row file", cells: [{ t: "Ann", s: "hl" }, { t: "a@x", s: "hl" }, { t: "Google", s: "hl" }, { t: "Bob", s: "good" }, { t: "b@x", s: "good" }, { t: "Amazon", s: "good" }] },
          { label: "names", cells: [{ t: "Ann", s: "hl" }, { t: "Bob", s: "good" }, "Cy"] },
          { label: "companies", cells: [{ t: "Google", s: "hl" }, { t: "Amazon", s: "good" }, "Jane St"] },
        ],
      },
      {
        type: "cells", title: "Compression: bitmap → run-length",
        caption: "Column values (rejections per night): 3 3 3 1 1 5 2. Similar neighbors compress well.",
        rows: [
          { label: "value = 1", cells: ["0", "0", "0", { t: "1", s: "hl" }, { t: "1", s: "hl" }, "0", "0"] },
          { label: "RLE", cells: [{ t: "3 zeros", s: "good" }, { t: "2 ones", s: "good" }, { t: "2 zeros", s: "good" }] },
          { label: "dictionary", cells: ["000=Club A", "001=Club B", "010=Club C", "…"] },
        ],
      },
    ],
    points: [
      { h: "Rows for apps, columns for analytics", t: "Loading one profile wants the whole row together. Computing an average over one field for all users wants that **column** together." },
      { h: "Column compression", t: "**Bitmap + run-length encoding** shrinks columns with repeated values. **Dictionary encoding** replaces a few distinct strings with a few bits. Less data means less network traffic and more fits in memory and CPU cache." },
      { h: "Predicate pushdown (Parquet)", t: "Parquet splits columns into chunks with metadata (min/max/sum). For `WHERE x > 60`, a chunk whose max is 55 is skipped entirely." },
      { h: "Costs", t: "Every column file must share the **same sort order**, and one row write touches many files. Fix: buffer rows in an LSM tree and flush column files in bulk." },
    ],
    takeaway: "Column stores (Parquet and data warehouses) win for analytical scans. Row stores win for “fetch this record” workloads.",
    terms: [
      ["Column-oriented storage", "Each column's values are stored contiguously."],
      ["Run-length encoding", "Store runs like “3 zeros, 2 ones” instead of every value."],
      ["Predicate pushdown", "Using chunk metadata to skip data that can't match a filter."],
      ["Parquet", "Open-source Apache columnar file format."],
    ],
    quiz: [
      { q: "Which workload best suits column-oriented storage?", a: ["Loading a single user's profile", "Averaging one field across millions of rows", "Updating one row frequently", "Key-value lookups"], c: 1, why: "You read only the column you need." },
      { q: "A Parquet chunk has max = 55. Query: `WHERE col > 60`. What happens?", a: ["The chunk is scanned", "The chunk is skipped (predicate pushdown)", "The query fails", "The chunk is recompressed"], c: 1, why: "Metadata proves no row can match." },
    ],
  },
  {
    n: 15, id: "E7Gk8etqkgU", duration: 694,
    title: "Data Serialization Frameworks",
    fullTitle: "Data Serialization Frameworks - You Should Be Using Them | Systems Design 0 to 1 with Ex-Google SWE",
    bigIdea: "JSON repeats field names in every record. **Protocol Buffers / Thrift / Avro** encode data compactly in binary using a **schema**, and handle schema changes safely.",
    visuals: [
      {
        type: "table", title: "Encodings compared",
        head: ["Format", "Readable?", "Size", "Schema"],
        rows: [
          ["JSON / XML", "Yes", "No, big (field names repeated)", "None, weakly typed"],
          ["Protobuf / Thrift", "No, binary", "Yes, small (numeric field tags)", "Defined in code at compile time"],
          ["Avro", "No, binary", "Yes, small", "Can be generated on the fly; reader/writer schemas reconciled"],
        ],
      },
      {
        type: "flow", title: "Avro: reader vs. writer schema",
        caption: "Matching fields map by name; unknown fields are ignored; missing ones get defaults.",
        nodes: [
          { id: "w", label: "Writer schema A", sub: "name, netWorth", x: 0, y: 0.5, kind: "client" },
          { id: "r", label: "Reader schema B", sub: "name, attractiveness", x: 2.2, y: 0.5, kind: "accent" },
        ],
        edges: [{ from: "w", to: "r", label: "name ✓ · netWorth ignored\nattractiveness = default" }],
        colW: 170,
      },
    ],
    points: [
      { h: "Why not JSON everywhere?", t: "It's human-readable but repeats keys in every record and is loosely typed. At scale that wastes disk and network." },
      { h: "Protobuf & Thrift", t: "A schema file gives every field a **numeric tag** (`name = 1`, `attractiveness = 2`). Only tags and values are encoded, so data is tiny and typed, and the schema doubles as documentation." },
      { h: "Evolving schemas", t: "Add new fields as **optional** (or with defaults) so old data still parses (forward compatible). Old code just ignores unknown fields (backward compatible)." },
      { h: "Avro for dynamic data", t: "When producers' formats aren't known at compile time (e.g. ingesting into Hadoop), Avro builds schemas from field names and **reconciles reader vs. writer** schemas." },
    ],
    takeaway: "Use a binary serialization framework for high-volume data between services and storage. It's smaller, typed and evolvable, but not human-readable.",
    terms: [
      ["Serialization", "Encoding in-memory objects into bytes to store or send."],
      ["Field tag", "Numeric ID for a field in Protobuf/Thrift, used instead of the field name."],
      ["Forward/backward compatibility", "New code reads old data / old code reads new data."],
    ],
    quiz: [
      { q: "Why are Protobuf messages smaller than JSON?", a: ["They're compressed with gzip", "Field names are replaced by small numeric tags", "They drop optional fields", "They're stored in columns"], c: 1, why: "Tags instead of repeated key strings." },
      { q: "You add a new field to a schema. How do you keep old records readable?", a: ["Make it required", "Make it optional or give it a default", "Renumber all tags", "Switch to JSON"], c: 1, why: "Existing rows don't have it." },
    ],
  },
]);
