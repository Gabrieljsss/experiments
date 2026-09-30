/* Lessons 32–38 · Choosing a Database
 * Summaries of "Systems Design 2.0" by Jordan has no life. All credit to him. */
window.LESSONS = (window.LESSONS || []).concat([
  {
    n: 32, id: "YgTLqO54UOA", duration: 501,
    title: "SQL vs. NoSQL (Relational vs. Non-Relational)",
    fullTitle: "SQL vs NoSQL - Who Wins? | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "Forget the query language. The real split is **normalized** (relational: tables + foreign keys) vs. **denormalized** (non-relational: self-contained records). It's a trade-off in **data locality**.",
    visuals: [
      {
        type: "cells", title: "Normalized: each fact stored once, linked by IDs",
        rows: [
          { label: "trains", cells: ["1 Red", "2 Blue", "3 Brown"] },
          { label: "stations", cells: ["1 Broadway", "2 Yankee Stadium", "3 Main St"] },
          { label: "train_stations", cells: [{ t: "(1,1)", s: "hl" }, { t: "(1,3)", s: "hl" }, { t: "(2,3)", s: "hl" }, { t: "(3,3)", s: "hl" }] },
        ],
      },
      {
        type: "cells", title: "Denormalized: everything for a key in one record",
        caption: "Reads are local, but “Main St” is now duplicated in three places.",
        rows: [
          { label: "Red", cells: ["Broadway", { t: "Main St", s: "bad" }] },
          { label: "Blue", cells: [{ t: "Main St", s: "bad" }] },
          { label: "Brown", cells: [{ t: "Main St", s: "bad" }] },
        ],
      },
    ],
    points: [
      { h: "Why not “SQL vs NoSQL”?", t: "Databases that speak SQL can work completely differently inside, and so can ones that don't. Talk about the **data model** (relational vs. non-relational) and the internals instead." },
      { h: "Relational = normalized", t: "One table per entity, and many-to-many relations via a join table of **foreign keys**. Each fact is stored once, so updates are easy." },
      { h: "The cost: poor locality", t: "A join touches several tables, which may sit in different places on disk or even on **different nodes**. That means slow distributed reads, and writes spanning tables may need **two-phase commit**." },
      { h: "Non-relational = denormalized", t: "Store what you read together in one record: fast single-place reads. But duplicated data makes updates touch many records (possibly a distributed transaction), and you may fetch more than you need." },
      { h: "How to choose", t: "Independent records (e.g. individual posts) suit non-relational. Naturally related data (books ↔ authors, trains ↔ stations) suits relational." },
    ],
    takeaway: "Choose relational when your data is full of relationships, and non-relational when records stand alone and you want locality.",
    terms: [
      ["Normalized data", "Each fact stored once; relationships via foreign keys."],
      ["Denormalized data", "Related data duplicated into self-contained records for locality."],
      ["Foreign key", "A column that references a row in another (or the same) table."],
    ],
    quiz: [
      { q: "Main downside of normalized data in a distributed database?", a: ["Duplicate data", "Joins and multi-table writes may span nodes (slow reads, 2PC writes)", "No indexes", "No transactions"], c: 1, why: "Poor data locality." },
      { q: "Main downside of denormalized data?", a: ["Slow single-record reads", "Updating a duplicated value must touch many records", "No key lookups", "Requires SQL"], c: 1, why: "The same fact lives in many places." },
    ],
  },
  {
    n: 37, id: "ix88Zj0asjs", duration: 729,
    title: "What is Hadoop (HDFS)?",
    fullTitle: "WTF is Hadoop? | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "Hadoop = **HDFS** (a rack-aware, replicated distributed file system) + compute engines (MapReduce, Spark) that run on the same machines as the data.",
    visuals: [
      {
        type: "flow", caption: "The NameNode holds metadata in memory; DataNodes hold the file blocks. Writes are pipelined replica → replica.",
        nodes: [
          { id: "c", label: "Client", x: 0, y: 0.5, kind: "client" },
          { id: "nn", label: "NameNode", sub: "metadata in RAM + WAL", x: 1.2, y: 0, kind: "accent" },
          { id: "a", label: "DataNode A", sub: "DC1 · primary", x: 1.2, y: 1.2, kind: "db" },
          { id: "b", label: "DataNode B", sub: "DC1", x: 2.4, y: 1.2, kind: "db" },
          { id: "cc", label: "DataNode C", sub: "DC2", x: 2.4, y: 0, kind: "db" },
        ],
        edges: [
          { from: "c", to: "nn", label: "where?" }, { from: "c", to: "a", label: "write once" },
          { from: "a", to: "b", label: "pipeline" }, { from: "b", to: "cc", label: "pipeline" },
        ],
      },
      {
        type: "steps", title: "High-availability NameNode",
        items: [
          ["Primary NameNode writes its log to ZooKeeper", "A consensus-backed, linearizable log."],
          ["Standby NameNode replays that log", "State-machine replication keeps it in sync in memory."],
          ["Primary dies → ZooKeeper notices", "The standby takes over, and clients discover the new primary via ZooKeeper."],
        ],
      },
    ],
    points: [
      { h: "NameNode = metadata", t: "Knows which DataNodes hold each file and at what version. It keeps this **in memory** for speed, with a WAL (plus snapshots) for recovery. On startup, it asks DataNodes what they hold and re-replicates under-replicated files." },
      { h: "Reads: ask once, then go direct", t: "The client asks the NameNode for a file's location, gets the **closest** replica, caches that location, and reads directly from the DataNode after that." },
      { h: "Writes: rack-aware + pipelined", t: "The NameNode picks a primary near the client and places replicas smartly (e.g. two in one data center, one in another). The client writes once; replicas forward it down a **pipeline** and acks flow back." },
      { h: "Not truly strongly consistent", t: "If the pipeline breaks halfway, some replicas have the new version and others don't. The client can retry, or the system converges eventually." },
    ],
    takeaway: "HDFS is the storage layer for big data: huge files, many reads, few writes, replicated and rack-aware. HBase, MapReduce and Spark all build on top of it.",
    terms: [
      ["HDFS", "Hadoop Distributed File System."],
      ["NameNode / DataNode", "Metadata server / storage servers in HDFS."],
      ["Replication pipeline", "A write flows replica → replica, with acks flowing back."],
      ["Rack awareness", "Placing replicas with knowledge of physical location to balance latency and fault tolerance."],
    ],
    quiz: [
      { q: "What does the HDFS NameNode store?", a: ["File contents", "Metadata: which DataNodes hold which files/versions", "Only the WAL", "User sessions"], c: 1, why: "The data itself lives on DataNodes." },
      { q: "How does the client write a file with replication factor 3?", a: ["Writes to all 3 replicas itself", "Writes once to the primary, which pipelines it on", "Writes to the NameNode", "Writes to ZooKeeper"], c: 1, why: "Replication pipeline." },
    ],
  },
  {
    n: 38, id: "ouxCE6ViVpw", duration: 825,
    title: "HBase vs. Cassandra",
    fullTitle: "What's HBase and how does it compare to Cassandra? | Systems Design 0 to 1 with Ex-Google SWE",
    bigIdea: "HBase is a database on top of HDFS. It adds fast **per-key updates** (LSM trees) to Hadoop, plus **column-oriented**, **range-partitioned** storage that suits batch analytics.",
    visuals: [
      {
        type: "flow", caption: "RegionServers run the LSM tree in memory; flushed SSTables are stored and replicated by HDFS.",
        nodes: [
          { id: "c", label: "Client", x: 0, y: 0.5, kind: "client" },
          { id: "m", label: "HMaster", sub: "which region?", x: 1.2, y: 0, kind: "accent" },
          { id: "r", label: "RegionServer", sub: "memtable + WAL", x: 1.2, y: 1.1 },
          { id: "d", label: "HDFS DataNodes", sub: "SSTables, replicated", x: 2.5, y: 1.1, kind: "db" },
          { id: "z", label: "ZooKeeper", sub: "master failover", x: 2.5, y: 0, kind: "good" },
        ],
        edges: [{ from: "c", to: "m" }, { from: "c", to: "r", label: "write" }, { from: "r", to: "d", label: "flush" }, { from: "m", to: "z", style: "dash" }],
      },
      {
        type: "table", title: "HBase or Cassandra?",
        head: ["", "HBase", "Cassandra"],
        rows: [
          ["Data model", "Wide-column", "Wide-column"],
          ["Write path", "LSM tree", "LSM tree"],
          ["Replication", "Via HDFS pipeline (single-leader-ish)", "Leaderless, quorums"],
          ["Storage layout", "Column-oriented", "Row-oriented"],
          ["Partitioning", "Range-based on row key", "Hash-based"],
          ["Best for", "Mutable data + big batch analytics", "Fast client-facing reads & writes"],
        ],
      },
    ],
    points: [
      { h: "HDFS alone can't edit", t: "Changing one value in an HDFS file means rewriting (and re-replicating) the whole multi-MB file. That's far too expensive for small updates." },
      { h: "How HBase fixes it", t: "Writes go to a RegionServer's in-memory **LSM tree** (plus WAL). When it's full it flushes an SSTable into HDFS, which replicates it. Each region = one partition." },
      { h: "Built for batch", t: "**Column-oriented** storage means analytics read only the needed columns (and can compress them). **Range partitioning** keeps nearby keys (like timestamps) together, which is ideal for sliding-window computations." },
      { h: "When to pick it", t: "For typical app traffic (fetch a row, write a row), Cassandra is better: leaderless and row-oriented. Choose HBase for data like sensor readings that you both **modify** and **crunch in batches**." },
    ],
    takeaway: "HBase = LSM-tree database on HDFS with columnar, range-partitioned storage. Great for batch + mutability, not your go-to for user-facing CRUD.",
    terms: [
      ["Wide-column store", "NoSQL model with a row key plus flexible, optional columns."],
      ["Row key", "Determines partitioning and sort order in HBase."],
      ["RegionServer", "HBase process that serves one or more key ranges (regions)."],
    ],
    quiz: [
      { q: "Main thing HBase adds on top of HDFS?", a: ["Replication", "Efficient per-key writes/updates via LSM trees", "Consensus", "SQL joins"], c: 1, why: "HDFS alone would rewrite whole files." },
      { q: "Why is range partitioning helpful for timestamped sensor data?", a: ["It spreads load randomly", "Nearby timestamps sit on the same node, which is good for window computations", "It avoids WALs", "It encrypts data"], c: 1, why: "Data locality for batch jobs." },
    ],
  },
]);
