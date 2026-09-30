/* Lessons 39–45 · Batch & Stream Processing
 * Summaries of "Systems Design 2.0" by Jordan has no life. All credit to him. */
window.LESSONS = (window.LESSONS || []).concat([
  {
    n: 39, id: "lHp7M078nHo", duration: 559,
    title: "What is MapReduce?",
    fullTitle: "WTF is MapReduce?? [Batch Processing] | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "MapReduce runs **your code where the data lives**: **map** lines to key/value pairs, **shuffle** by key, **reduce** each key's values. It's built to survive failures.",
    visuals: [
      {
        type: "steps", title: "One MapReduce job",
        items: [
          ["Map", "Turn each raw log line into `(key, value)`, e.g. `(userId, msgLength)`."],
          ["Sort (locally)", "Each node sorts its mapped pairs by key."],
          ["Shuffle", "`hash(key)` decides which reducer node each pair goes to. Sorted lists merge in O(n)."],
          ["Reduce", "For each key, fold its values into one, e.g. average → `(21, 10)`."],
          ["Materialize", "Write results back to HDFS (replicated)."],
        ],
      },
      {
        type: "cells", title: "Why sorted input helps the reducer",
        caption: "Sorted: once B appears, A is finished and can be flushed. Unsorted: every key's running total stays in memory.",
        rows: [
          { label: "sorted", cells: [{ t: "A 6", s: "hl" }, { t: "A 8", s: "hl" }, { t: "A 10", s: "hl" }, { t: "→ A=24 flush", s: "good" }, "B 3", "B 7", "B 4"] },
          { label: "unsorted", cells: ["B 3", "B 4", "A 6", { t: "A 10", s: "bad" }, "B 7", "A 8", { t: "…all in RAM", s: "bad" }] },
        ],
      },
    ],
    points: [
      { h: "Why it exists", t: "Run **arbitrary code** (not just SQL) over huge datasets in HDFS, computing on the nodes that hold the data (data locality)." },
      { h: "Built for failure", t: "It was designed in the early 2000s for shared servers where batch tasks often got preempted. A failed piece is re-run on its own, not the whole job." },
      { h: "Sorting keeps reducers lean", t: "Sorted keys let a reducer finish one key, write it to disk, and move on, so memory stays small." },
      { h: "Chaining jobs", t: "Each job goes disk → disk, so you can chain many jobs for complex pipelines. It's powerful but slow, which motivates Spark." },
    ],
    takeaway: "MapReduce = map → sort → shuffle → reduce → write to HDFS. It's fault tolerant and general, but disk-heavy.",
    terms: [
      ["Mapper", "Function from an input record to key/value pairs."],
      ["Reducer", "Function from a key and its list of values to a single result."],
      ["Shuffle", "Repartitioning mapped output by key hash so each key lands on one reducer."],
    ],
    quiz: [
      { q: "What decides which reducer receives a key?", a: ["Random choice", "hash(key)", "The mapper's node ID", "Alphabetical order"], c: 1, why: "That's the shuffle." },
      { q: "Why does MapReduce sort before reducing?", a: ["For pretty output", "So reducers can finish one key at a time with low memory", "To compress data", "To avoid the shuffle"], c: 1, why: "Sorted input means streaming aggregation." },
    ],
  },
  {
    n: 40, id: "gqxbQTVgdkI", duration: 662,
    title: "Batch Job Joins Done Right",
    fullTitle: "The *Right* Way to do Batch Job Data Joins | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "Three ways to join big datasets. **Sort-merge** always works but is slow. **Broadcast hash** and **partitioned hash** joins skip sorting and moving the big dataset.",
    visuals: [
      {
        type: "table",
        head: ["Join", "When", "Cost"],
        rows: [
          ["Sort-merge", "Always possible", "Sort everything (n log n) and re-partition at least one dataset over the network"],
          ["Broadcast hash", "One side fits in memory", "Ship the small side to every node, hash lookup while scanning the big side: O(n)"],
          ["Partitioned hash", "Both big, but partitioned the same way", "Ship matching small partitions to the big ones, then hash join per partition"],
        ],
      },
      {
        type: "flow", title: "Broadcast hash join",
        nodes: [
          { id: "s", label: "Small table", sub: "fits in RAM", x: 0, y: 0.5, kind: "good" },
          { id: "n1", label: "Big shard 1", sub: "hashmap(small) + scan", x: 1.4, y: 0, kind: "db" },
          { id: "n2", label: "Big shard 2", sub: "hashmap(small) + scan", x: 1.4, y: 1, kind: "db" },
        ],
        edges: [{ from: "s", to: "n1", label: "copy" }, { from: "s", to: "n2", label: "copy" }],
      },
    ],
    points: [
      { h: "Sort-merge join", t: "Sort both datasets, re-partition by key, then merge sorted lists (a heap over lists, all on disk, little memory). It's general but slow: sorting is n log n, and a whole dataset crosses the network." },
      { h: "Broadcast hash join", t: "If one side is small, send it to every node as an in-memory hashmap. Scan the big side once with O(1) lookups. No sorting, and the big data never moves." },
      { h: "Partitioned hash join", t: "If both are big but partitioned by the same key, send each small partition to its matching big partition and hash-join locally." },
      { h: "Plan ahead", t: "Partition and index datasets on the join key up front and joins become cheap. Choosing the right join strategy can turn hours-long pipelines into minutes." },
    ],
    takeaway: "Before defaulting to sort-merge, ask: is one side small (broadcast)? Are both partitioned the same way (partitioned hash)?",
    terms: [
      ["Sort-merge join", "Sort both inputs by key and merge them."],
      ["Broadcast hash join", "Replicate the small input everywhere as a hash table."],
      ["Partitioned hash join", "Hash join done per co-partitioned chunk."],
    ],
    quiz: [
      { q: "Joining 10 TB of clicks with a 50 MB country table. Best join?", a: ["Sort-merge", "Broadcast hash", "Partitioned hash", "Nested loop"], c: 1, why: "Ship the tiny table everywhere." },
      { q: "Main cost of sort-merge joins?", a: ["Needs lots of RAM", "Sorting everything and shipping data over the network", "Only works on SQL", "Can't use disk"], c: 1, why: "n log n sort plus a re-partition." },
    ],
  },
  {
    n: 41, id: "ZYTZ4JwRZqE", duration: 664,
    title: "Spark vs. MapReduce",
    fullTitle: "You Should Be Using Spark, Not MapReduce | Systems Design Interview 0 to 1 With Ex-Google SWE",
    bigIdea: "Spark keeps intermediate data **in memory** (RDDs), chains arbitrary **operators** without forced sorts, and recovers from failures by **recomputing** lost pieces.",
    visuals: [
      {
        type: "table", title: "Why MapReduce is slow, and what Spark does instead",
        head: ["MapReduce pain", "Spark fix"],
        rows: [
          ["Chained jobs wait for each other", "Knows the whole job graph, so starts steps as soon as inputs are ready"],
          ["Every job needs map + sort", "Arbitrary operators, no mandatory sorting"],
          ["Writes intermediate state to disk", "Keeps it in memory (RDDs); disk only at input/output"],
        ],
      },
      {
        type: "table", title: "Recovering from a failed node",
        head: ["Dependency", "Meaning", "Recovery"],
        rows: [
          ["Narrow", "Each output partition needs data from one node (e.g. map)", "Recompute lost partitions in parallel on other nodes"],
          ["Wide", "Needs data from many nodes (e.g. shuffle/groupBy)", "Spark **checkpoints to disk** after wide steps, then recomputes from there"],
        ],
      },
    ],
    points: [
      { h: "MapReduce's three problems", t: "Chained jobs idle while waiting, every job pays for map and sort, and every intermediate result hits disk." },
      { h: "Operators + RDDs", t: "A Spark job is a graph of operators (map, shuffle, reduce, anything). Data between them lives in memory as **Resilient Distributed Datasets**." },
      { h: "Narrow dependencies recover cheaply", t: "Lost partitions are recomputed from the source data, and the work can be spread across the surviving nodes." },
      { h: "Wide dependencies get checkpoints", t: "Rebuilding a shuffle would need everyone's data, so Spark writes to disk after wide steps. Later failures restart from that checkpoint." },
      { h: "Trade-off", t: "Much faster, but uses **more memory** than MapReduce, which leaves less for other work on a shared cluster." },
    ],
    takeaway: "Use Spark for batch jobs: in-memory, graph-aware, no needless sorts, with fault tolerance via recomputation and occasional checkpoints.",
    terms: [
      ["RDD", "Resilient Distributed Dataset: Spark's in-memory, partitioned, recomputable data."],
      ["Narrow dependency", "An output partition depends on one input partition."],
      ["Wide dependency", "An output partition depends on many input partitions (a shuffle)."],
    ],
    quiz: [
      { q: "Where does Spark keep intermediate results?", a: ["On disk after every step", "In memory (RDDs)", "In ZooKeeper", "In the client"], c: 1, why: "Disk is used mainly at input, output and checkpoints." },
      { q: "When does Spark checkpoint to disk?", a: ["After every operator", "After wide dependencies (shuffles)", "Never", "Only at the start"], c: 1, why: "Those are expensive to recompute." },
    ],
  },  {
    n: 42, id: "7PjPhgCoT9c", duration: 803,
    title: "What is Stream Processing?",
    fullTitle: "What's Stream Processing + When Do We Use It?  | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "Instead of writing to a database and polling, **producers** emit events through a **broker** to **consumers** that react in real time.",
    visuals: [
      {
        type: "flow", caption: "A broker turns O(n²) direct connections into O(n).",
        nodes: [
          { id: "p1", label: "Producer", x: 0, y: 0, kind: "client" },
          { id: "p2", label: "Producer", x: 0, y: 1, kind: "client" },
          { id: "b", label: "Message broker", x: 1.2, y: 0.5, kind: "accent" },
          { id: "c1", label: "Consumer", x: 2.4, y: 0 },
          { id: "c2", label: "Consumer", x: 2.4, y: 1 },
        ],
        edges: [{ from: "p1", to: "b" }, { from: "p2", to: "b" }, { from: "b", to: "c1" }, { from: "b", to: "c2" }],
      },
      {
        type: "table", title: "Time windows",
        head: ["Window", "Shape", "How to compute"],
        rows: [
          ["Tumbling", "Fixed, non-overlapping (every 1 min)", "Bucket by `floor(ts/1min)` in a hashmap"],
          ["Hopping", "Fixed size, overlapping (5 min, every 1 min)", "Combine 5 one-minute tumbling buckets"],
          ["Sliding", "“Last 5 minutes” right now", "In-memory queue; evict events older than 5 min"],
        ],
      },
    ],
    points: [
      { h: "Why a broker", t: "Direct TCP connections between many producers and consumers grow as O(n²) and burden busy servers. A dedicated broker handles connections and delivery." },
      { h: "Use case 1: windowed aggregation", t: "Group metrics or logs into **tumbling**, **hopping** or **sliding** time windows." },
      { h: "Use case 2: change data capture (CDC)", t: "Every DB write is also published to the broker, and consumers keep **derived data** (like a search index) in sync. This avoids an expensive two-phase commit." },
      { h: "Use case 3: event sourcing", t: "Write **database-agnostic events** (“added item to cart”) to the broker first, and have consumers build databases from them. Years later you can replay the events into a brand-new data model." },
      { h: "Exactly-once processing", t: "At-least-once needs a fault-tolerant broker (WAL + replication) plus consumer **acks**. No-more-than-once needs two-phase commit (slow) or **idempotency keys** that consumers remember." },
    ],
    takeaway: "Streams let parts of a system react in real time. CDC and event sourcing are go-to interview tools for keeping derived data in sync.",
    terms: [
      ["Message broker", "Middleman that receives events from producers and delivers them to consumers."],
      ["Change data capture", "Streaming a database's writes to other systems."],
      ["Event sourcing", "Storing immutable domain events as the source of truth and deriving state from them."],
      ["Idempotency key", "A unique message ID so reprocessing has no extra effect."],
    ],
    quiz: [
      { q: "Keep a search index in sync with your primary DB without two-phase commit. Use…", a: ["Polling", "Change data capture through a broker", "A bigger cache", "Quorum writes"], c: 1, why: "Stream every DB write to the index." },
      { q: "A 5-minute hopping window every minute can be built from…", a: ["A sliding window", "Five 1-minute tumbling windows", "A Bloom filter", "A single hashmap entry"], c: 1, why: "Aggregate the tumbling buckets." },
    ],
  },
  {
    n: 43, id: "_5mu7lZz5X4", duration: 696,
    title: "Kafka vs. RabbitMQ",
    fullTitle: "Kafka vs. RabbitMQ - who wins and why? | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "**In-memory brokers** (RabbitMQ, SQS) hand messages out round-robin and delete them. **Log-based brokers** (Kafka, Kinesis) keep an ordered, replayable log on disk.",
    visuals: [
      {
        type: "table",
        head: ["", "In-memory (RabbitMQ, ActiveMQ, SQS)", "Log-based (Kafka, Kinesis)"],
        rows: [
          ["Delivery", "Round-robin to any free consumer", "In order, per partition; broker tracks each consumer's offset"],
          ["Ordering", "No, can be processed out of order", "Yes, within a partition"],
          ["After ack", "Deleted", "Kept on disk: replayable"],
          ["Slow message", "Doesn't block others", "Blocks the rest of its partition"],
          ["Scale by", "Adding consumers", "Adding partitions"],
        ],
      },
      {
        type: "cells", title: "Log-based broker: consumers keep offsets",
        rows: [
          { label: "partition", cells: [{ t: "m1", s: "good" }, { t: "m2", s: "good" }, { t: "m3", s: "hl" }, "m4", { t: "+ m5 →", s: "gap" }] },
          { label: "consumer B", cells: [{ t: "offset → m3", s: "hl" }] },
        ],
      },
    ],
    points: [
      { h: "In-memory brokers", t: "A queue in RAM. Each message goes to the next available consumer and is deleted once acked. Throughput is maximal, but order isn't guaranteed and durability needs extra work." },
      { h: "Log-based brokers", t: "Messages are appended sequentially to disk. Each consumer reads a partition **in order** and the broker remembers its offset. Nothing is deleted on read, so you can **replay**." },
      { h: "Pick in-memory when order doesn't matter", t: "Encoding uploaded videos, or fanning tweets out to followers' feed caches: just get the work done fast." },
      { h: "Pick log-based when order or replay matters", t: "Sensor metrics for moving averages, or **CDC** (x=5 then x=7 is not x=7 then x=5), or when you'll add new derived consumers later." },
    ],
    takeaway: "Need order or replay? Kafka-style log. Just need tasks done fast? RabbitMQ-style queue.",
    terms: [
      ["Offset", "A consumer's position in a log partition."],
      ["Round-robin delivery", "Handing each message to the next free consumer."],
      ["Fan-out", "Splitting into separate queues/partitions per consumer."],
    ],
    quiz: [
      { q: "Best broker for change data capture into a search index?", a: ["In-memory, round-robin", "Log-based (Kafka)", "Direct UDP", "None"], c: 1, why: "Order matters and replay is valuable." },
      { q: "Best broker for a pool of video-encoding workers?", a: ["Log-based", "In-memory queue", "A database table", "Gossip"], c: 1, why: "Order doesn't matter; maximize throughput." },
    ],
  },
  {
    n: 44, id: "oiPCC8G6ufg", duration: 722,
    title: "Stream Joins",
    fullTitle: "Stop messing up your stream processing joins! | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "To **enrich** events, consumers join them with other data. The trick is always the same: **cache state in the consumer** and keep it fresh with CDC.",
    visuals: [
      {
        type: "flow", title: "Stream-table join with CDC",
        caption: "No network call per event: the consumer holds an in-memory copy of the table, updated via CDC.",
        nodes: [
          { id: "db", label: "Users table", x: 0, y: 0, kind: "db" },
          { id: "cdc", label: "CDC queue", x: 1.1, y: 0, kind: "accent" },
          { id: "s", label: "Search events", x: 0, y: 1, kind: "client" },
          { id: "c", label: "Consumer", sub: "hashmap(users)", x: 1.1, y: 1 },
          { id: "o", label: "Enriched events", x: 1.1, y: 2, kind: "good" },
        ],
        edges: [{ from: "db", to: "cdc" }, { from: "cdc", to: "c" }, { from: "s", to: "c" }, { from: "c", to: "o" }],
      },
      {
        type: "table",
        head: ["Join", "Example", "Consumer caches"],
        rows: [
          ["Stream–stream", "Searches ⨝ clicks by userId", "Recent events from both streams"],
          ["Stream–table", "Searches ⨝ user demographics", "A copy of the table (kept fresh via CDC)"],
          ["Table–table", "Always-fresh join of two tables", "Both tables (CDC on each)"],
        ],
      },
    ],
    points: [
      { h: "Stream–stream", t: "Events arrive at different times, so cache each side (for a window, say 5 minutes) in a hashmap on the consumer and emit a joined event when the match arrives." },
      { h: "Stream–table", t: "Querying the DB per event is slow. Instead keep an in-memory copy of the table, updated through **CDC**." },
      { h: "Table–table", t: "Instead of re-running a big SQL join every few seconds, CDC both tables into the consumer and update the join **incrementally**." },
      { h: "The catch", t: "Consumer memory is limited, so partition queues and consumers the same way by key. In-memory state isn't fault tolerant, and that's what the next lesson solves." },
    ],
    takeaway: "Stream joins = co-partitioned consumers holding cached state, kept current by CDC.",
    terms: [
      ["Stream enrichment", "Adding related data to events as they flow."],
      ["Sink queue", "Where enriched output goes for downstream consumers."],
    ],
    quiz: [
      { q: "Why not query the database for every event in a stream–table join?", a: ["Databases can't handle joins", "Network calls per event are slow; a local cached copy is faster", "It breaks ordering", "It needs Raft"], c: 1, why: "Keep the table in memory, fresh via CDC." },
      { q: "Biggest risk of keeping join state in consumer memory?", a: ["It's too fast", "It's lost if the consumer crashes", "It needs SQL", "It prevents partitioning"], c: 1, why: "In-memory state isn't fault tolerant by itself." },
    ],
  },
  {
    n: 45, id: "fYO5-6Owt0w", duration: 657,
    title: "Apache Flink",
    fullTitle: "Apache Flink - A Must-Have For Your Streams | Systems Design Interview 0 to 1 With Ex-Google SWE",
    bigIdea: "Flink makes stateful consumers fault tolerant: **barrier messages** trigger consistent **snapshots** to S3, and on failure you restore and **replay** from Kafka.",
    visuals: [
      {
        type: "flow", caption: "A node snapshots only after receiving the barrier from ALL its inputs, which keeps snapshots causally consistent.",
        nodes: [
          { id: "p", label: "Producer", x: 0.55, y: 0, kind: "client" },
          { id: "c1", label: "C1", sub: "snapshot on B", x: 0, y: 1 },
          { id: "c2", label: "C2", sub: "snapshot on B", x: 1.1, y: 1 },
          { id: "c3", label: "C3", sub: "waits for both B's", x: 0.55, y: 2, kind: "accent" },
          { id: "s3", label: "S3", sub: "checkpoints", x: 0.55, y: 3, kind: "db" },
        ],
        edges: [
          { from: "p", to: "c1", label: "…B…" }, { from: "p", to: "c2", label: "…B…" },
          { from: "c1", to: "c3", label: "B" }, { from: "c2", to: "c3", label: "B" }, { from: "c3", to: "s3", style: "dash" },
        ],
      },
      {
        type: "lanes", title: "Why naive failover double-processes",
        lanes: ["C2", "Queue → C3"],
        rows: [
          ["read msg, emit result", "result ①"],
          [{ t: "crash before ack 💥", s: "bad" }, ""],
          ["C4 replaces C2, rereads msg", { t: "result ① again", s: "bad" }],
        ],
      },
    ],
    points: [
      { h: "Stream processing frameworks", t: "Flink, Spark Streaming, Storm, Tez: these are the **consumers**, not the broker. Flink handles events one by one in real time, while Spark Streaming uses micro-batches. Both are declarative, with a job manager handling the details." },
      { h: "Why replicas aren't enough", t: "A consumer can emit output and crash before acking its input. The replacement re-processes the message, so downstream state changes twice." },
      { h: "Barriers → consistent checkpoints", t: "The job manager injects **barrier** messages. Each operator checkpoints its state when it has seen the barrier on every input, giving one consistent cut across the whole graph." },
      { h: "Restore + replay", t: "On failure, load the last checkpoint and replay from **replayable** (log-based) queues after the barrier. Every event affects state **exactly once**, and only a few messages need replaying." },
      { h: "Lightweight", t: "Snapshots copy state without locking, and the copies are garbage-collected afterward." },
    ],
    takeaway: "Interview answer for “how are your stream consumers fault tolerant?”: Flink-style barrier checkpoints to S3 + Kafka replay = exactly-once state updates.",
    terms: [
      ["Barrier", "A marker message that tells operators when to snapshot."],
      ["Checkpoint", "Saved consumer state used to recover after failure."],
      ["Exactly-once state", "Each event affects internal state once, even across failures."],
    ],
    quiz: [
      { q: "When does a Flink operator with two inputs take its snapshot?", a: ["On the first barrier", "After barriers arrive from both inputs", "Every second", "On crash"], c: 1, why: "That's what keeps checkpoints consistent." },
      { q: "What kind of broker does Flink recovery need?", a: ["In-memory, delete-on-ack", "Replayable, log-based (e.g. Kafka)", "None", "UDP"], c: 1, why: "It replays from the checkpoint offset." },
    ],
  },
]);
