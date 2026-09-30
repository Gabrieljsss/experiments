/* Lessons 25–31 · Partitioning, Distributed Transactions, Consistency & Consensus
 * Summaries of "Systems Design 2.0" by Jordan has no life. All credit to him. */
window.LESSONS = (window.LESSONS || []).concat([
  {
    n: 25, id: "Bt8ZMC_Yuys", duration: 655,
    title: "Introduction to Partitioning",
    fullTitle: "Introduction to Partitioning | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "When data no longer fits on one machine, **split it** into partitions (shards). The key question is how to decide which key lives where.",
    visuals: [
      {
        type: "table", title: "Range vs. hash-range partitioning",
        head: ["", "Key range (A–C, D–F, …)", "Hash range (hash(key) in 1–250, …)"],
        rows: [
          ["Range queries", "Yes, similar keys sit together", "No, keys are scattered"],
          ["Hot spots", "No, e.g. lots of A–C names, no X–Z", "Yes, spread evenly (except one mega-hot key)"],
        ],
      },
      {
        type: "table", title: "Secondary indexes on a partitioned DB",
        head: ["", "Local secondary index", "Global secondary index"],
        rows: [
          ["Stored as", "Each shard indexes its own rows", "The index itself is partitioned (e.g. heights ≤ 6'3\" on shard 1)"],
          ["Read “everyone 6'3\"”", "Query every shard", "Query one shard"],
          ["Write", "One node", "May hit two nodes, needing a **distributed transaction**"],
        ],
      },
    ],
    points: [
      { h: "Replication isn't enough", t: "Replicas copy the **whole** dataset. Once it's hundreds of terabytes, you must break it into pieces on different nodes: **partitioning**, aka sharding." },
      { h: "Range partitioning", t: "Split by key ranges (names A–C, D–F…). Great for range queries (one node), but prone to **hot spots**: lopsided data and traffic." },
      { h: "Hash-range partitioning", t: "Hash each key and assign hash ranges to nodes. Load spreads evenly, but range queries become scatter-gather. A single celebrity key can still be hot." },
      { h: "Secondary indexes", t: "**Local**: cheap writes, but reads fan out to all shards. **Global**: one-shard reads, but a write can touch two nodes, and keeping them in sync needs **two-phase commit** (next lesson)." },
    ],
    takeaway: "Choose the partition key from your access patterns: range for range scans, hash for even load. Global secondary indexes buy fast reads with expensive writes.",
    terms: [
      ["Partition / shard", "A subset of the data stored on one node."],
      ["Hot spot", "A partition receiving disproportionate data or traffic."],
      ["Local / global secondary index", "An index per shard / an index partitioned across the cluster."],
    ],
    quiz: [
      { q: "Main downside of partitioning users by first letter?", a: ["No range queries", "Hot spots, since names aren't evenly distributed", "Needs consensus", "Can't replicate"], c: 1, why: "A–C gets far more rows than X–Z." },
      { q: "Why can a global secondary index make writes expensive?", a: ["It's stored in RAM", "The row and its index entry may live on different nodes, needing a distributed transaction", "It needs sorting", "It blocks reads"], c: 1, why: "Two nodes must be updated atomically." },
    ],
  },
  {
    n: 26, id: "7DoT2sTGulc", duration: 499,
    title: "Two-Phase Commit",
    fullTitle: "Two Phase Commit - Distributed Transactions | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "2PC makes a write across several nodes **atomic**: a coordinator asks everyone “ready?”, and only commits if **all** say yes. The downside is that it blocks when anyone fails.",
    visuals: [
      {
        type: "lanes", title: "Happy path",
        lanes: ["Coordinator", "Node 1", "Node 2"],
        rows: [
          ["prepare m1 / m2", "", ""],
          ["", "lock rows, WAL → OK", "lock rows, WAL → OK"],
          [{ t: "write COMMIT to own log", s: "good" }, "", ""],
          ["commit!", "commit, unlock", "commit, unlock"],
        ],
      },
      {
        type: "cards", title: "Failure modes",
        items: [
          { icon: "🙅", title: "A node says no", text: "The coordinator sends abort, and everyone unlocks." },
          { icon: "💀", title: "Coordinator dies after prepare", text: "Participants sit holding locks until it recovers (it rereads its commit log)." },
          { icon: "🔁", title: "Participant dies after OK", text: "The coordinator must retry forever until it comes back and commits." },
        ],
      },
    ],
    points: [
      { h: "When you need it", t: "Cross-partition writes and global secondary indexes. If one side succeeds and the other fails, you get permanent **incorrect** data, not just eventual staleness." },
      { h: "Phase 1: prepare", t: "The coordinator (often just the app server) asks each participant if it can commit. Each checks locally, writes its WAL, **grabs locks**, and replies OK or no." },
      { h: "Phase 2: commit", t: "If all say OK, the coordinator records the decision in its own **commit log** (the commit point), then tells everyone to commit. Any “no” means abort." },
      { h: "Why it's feared", t: "Many points of failure. After the commit point, locked rows stay untouchable until the dead party recovers. There's little fault tolerance." },
    ],
    takeaway: "Avoid cross-partition writes where you can (better partition keys, denormalized documents). Use 2PC only when atomicity across nodes is required.",
    terms: [
      ["Coordinator", "The node driving a two-phase commit."],
      ["Commit point", "The moment the coordinator durably decides to commit; after that it must finish."],
      ["Distributed transaction", "A transaction spanning multiple nodes/partitions."],
    ],
    quiz: [
      { q: "In 2PC, when can the coordinator send “commit”?", a: ["After any node says OK", "After all participants say OK", "Immediately", "After a majority says OK"], c: 1, why: "All-or-nothing, unlike Raft's majority." },
      { q: "Coordinator crashes after participants voted OK. What happens?", a: ["They commit anyway", "They abort", "They wait, holding locks, until it recovers", "They elect a new leader"], c: 2, why: "This blocking is 2PC's big weakness." },
    ],
  },
  {
    n: 27, id: "z-xxLoJAfmY", duration: 713,
    title: "Consistent Hashing",
    fullTitle: "Consistent Hashing - Rebalancing Partitions | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "`hash(key) % n` reshuffles almost every key when n changes. A **consistent hashing ring** moves only the keys next to the node that joined or left.",
    visuals: [
      {
        type: "table", title: "hash % n: remove one node and most keys move",
        head: ["hash(key)", "% 4 (4 nodes)", "% 3 (3 nodes)"],
        rows: [["16", "node 0", "node 1 ↻"], ["28", "node 0", "node 1 ↻"], ["12", "node 0", "node 0"], ["19", "node 3", "node 1 ↻"]],
      },
      {
        type: "flow", title: "The ring",
        caption: "Each node owns several points (virtual nodes). A key belongs to the first node point clockwise from its hash.",
        nodes: [
          { id: "a", label: "N1", x: 1, y: 0, kind: "accent circle", w: 0.5 },
          { id: "b", label: "N3", x: 1.9, y: 0.6, kind: "good circle", w: 0.5 },
          { id: "c", label: "N2", x: 1.9, y: 1.6, kind: "circle", w: 0.5 },
          { id: "d", label: "N1", x: 1, y: 2.2, kind: "accent circle", w: 0.5 },
          { id: "e", label: "N3", x: 0.1, y: 1.6, kind: "good circle", w: 0.5 },
          { id: "f", label: "N2", x: 0.1, y: 0.6, kind: "circle", w: 0.5 },
          { id: "k", label: "key “kate”", sub: "hash = 310", x: 1, y: 1.1, kind: "client" },
        ],
        edges: [
          { from: "a", to: "b", bend: -20, noArrow: true }, { from: "b", to: "c", bend: -12, noArrow: true }, { from: "c", to: "d", bend: -20, noArrow: true },
          { from: "d", to: "e", bend: -20, noArrow: true }, { from: "e", to: "f", bend: -12, noArrow: true }, { from: "f", to: "a", bend: -20, noArrow: true },
          { from: "k", to: "c", style: "accent dash", label: "clockwise" },
        ],
        colW: 150, rowH: 80, noFlip: true,
      },
    ],
    points: [
      { h: "Why not modulo?", t: "Losing one of 4 nodes changes `mod 4` to `mod 3`, and nearly every key lands somewhere new. That's a huge, pointless amount of data shipped over the network." },
      { h: "The ring", t: "Hash space is a circle. Each node is placed at **k points** on it. A key is stored on the next node point going clockwise from its hash." },
      { h: "Minimal movement", t: "Remove a node and only its slices go to their clockwise neighbors. Add a node and it steals a few small slices. Untouched nodes keep their keys." },
      { h: "Alternative: a fixed number of partitions", t: "Create, say, 1,000 partitions up front and move whole partitions between nodes. It's simple, but pick the count carefully: too few and partitions get huge, too many and there's metadata overhead." },
      { h: "Automatic rebalancing is risky", t: "If the system rebalances whenever it *thinks* a node is down, a false alarm triggers expensive data movement. Knowing who is really down needs consensus." },
    ],
    takeaway: "Use consistent hashing (with virtual nodes) to partition keys, or to spread requests across servers, so scaling up or down moves as little data as possible.",
    terms: [
      ["Consistent hashing", "Partitioning on a hash ring so membership changes move only nearby keys."],
      ["Virtual nodes", "Multiple ring positions per physical node for a more even spread."],
      ["Rebalancing", "Moving partitions when nodes are added or removed."],
    ],
    quiz: [
      { q: "Why is `hash(key) % n` bad for a changing cluster?", a: ["Hashes collide", "Changing n remaps most keys", "It can't handle strings", "It's slow to compute"], c: 1, why: "Nearly everything moves." },
      { q: "On a consistent-hash ring, a node leaves. Which keys move?", a: ["All keys", "Only that node's keys, to their clockwise neighbors", "Half the keys", "None, they're lost"], c: 1, why: "Everything else stays put." },
    ],
  },
  {
    n: 28, id: "C_XLEeWUq3M", duration: 764,
    title: "Linearizable Databases",
    fullTitle: "Linearizable Databases | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "**Linearizable** storage is fault tolerant with one agreed order of writes, so reads **never go back in time**. Locks and leader election depend on it.",
    visuals: [
      {
        type: "steps", title: "Lamport clocks: a total order in O(1) space",
        items: [
          ["Everyone keeps a counter", "Clients and DB nodes start at 0."],
          ["On each write: max(client, node) + 1", "Both sides adopt the new value."],
          ["Sort by (counter, node id)", "Ties broken by node order, e.g. A1 < B1 < B2 < A3 < A4."],
        ],
      },
      {
        type: "lanes", title: "Single leader still isn't linearizable under failure",
        lanes: ["Leader", "Follower", "Client"],
        rows: [
          ["x=5, x=10", "has x=5", ""],
          ["", "", "reads x=10 (leader)"],
          [{ t: "crashes 💥", s: "bad" }, "", ""],
          ["", "promoted", { t: "reads x=5 ⏪", s: "bad" }],
        ],
      },
    ],
    points: [
      { h: "Why we need it", t: "A distributed lock must have exactly one holder. A leader must stay the leader. If reads can go back in time (“A is leader… B is leader… A is leader”), everything built on top breaks." },
      { h: "Ordering writes", t: "Single-leader uses its replication log. Multi-leader and leaderless setups can impose a consistent (if arbitrary) order with **version vectors** (O(n) space) or **Lamport clocks** (O(1): a counter plus node id)." },
      { h: "Ordering after the fact isn't enough", t: "Lamport clocks order writes, but a client can still read x=1, then x=5, then x=1 from different replicas before they converge. That's not linearizable." },
      { h: "Even single-leader fails", t: "If the leader dies before replicating x=10, a reader who saw 10 may then see 5. We need **total order broadcast**: every node agrees on the same log, even through failures, which is **distributed consensus**." },
    ],
    takeaway: "Linearizability = a single, fault-tolerant order of writes where reads never regress. It's the foundation for locks, leader election and coordination services.",
    terms: [
      ["Linearizable", "Behaves like a single copy of the data; once you read a value, you never see an older one."],
      ["Lamport clock", "A logical (counter, node) timestamp that gives a total order of events."],
      ["Total order broadcast", "Every node delivers the same messages in the same order, reliably."],
    ],
    quiz: [
      { q: "Advantage of Lamport clocks over version vectors?", a: ["They detect concurrency", "Constant size regardless of node count", "They use wall-clock time", "They're linearizable"], c: 1, why: "Always a counter plus a node id." },
      { q: "Why isn't async single-leader replication linearizable?", a: ["Leaders can't order writes", "After failover, a reader may see an older value than it saw before", "Followers reject writes", "It uses Lamport clocks"], c: 1, why: "Un-replicated writes disappear on failover." },
    ],
  },
  {
    n: 29, id: "Al2JNJBGG30", duration: 517,
    title: "Raft: Leader Election",
    fullTitle: "Distributed Consensus - Raft Leader Election | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "Raft builds a **replicated log** everyone agrees on. First it elects exactly one leader per **term**, using randomized timeouts and **majority votes**.",
    visuals: [
      {
        type: "steps", title: "An election",
        items: [
          ["Leader sends heartbeats", "Followers expect them periodically."],
          ["Heartbeats stop", "Each follower waits a **random** timeout so they don't all panic at once."],
          ["First to time out becomes candidate", "Increments the term (28 → 29) and requests votes."],
          ["Voters check two things", "Is the term newer than mine? Is the candidate's log at least as up to date as mine? If both, vote yes (once per term)."],
          ["Majority of yes votes → leader", "Starts sending heartbeats for term 29."],
        ],
      },
      {
        type: "cards",
        items: [
          { icon: "1️⃣", title: "One leader per term", text: "Two majorities always overlap, so two candidates can't both win." },
          { icon: "🚧", title: "Fencing tokens", text: "The term number fences off old leaders: writes with a stale term are rejected." },
          { icon: "📚", title: "Up-to-date logs", text: "The winner's log has every committed write, so it can backfill others." },
        ],
      },
    ],
    points: [
      { h: "Why Raft?", t: "It's a consensus algorithm like Paxos, but easier to understand. Its output is a **distributed log**, and an ordered log is linearizable." },
      { h: "Terms (epochs)", t: "Each election bumps the term. Anyone who sees a higher term updates their own, and an old leader that hears it steps down to follower." },
      { h: "Voting rules", t: "Refuse candidates whose term isn't newer than yours or whose log is **less up to date** than yours. Otherwise, grant your single vote for that term." },
      { h: "Why the leader has all committed writes", t: "A committed write lives on a majority. To win, a candidate needs votes from a majority, and at least one of those has the write and would refuse a candidate missing it." },
    ],
    takeaway: "Raft election guarantees one leader per term, fences old leaders, and ensures the leader's log contains everything committed.",
    terms: [
      ["Term / epoch", "Monotonic election counter in Raft."],
      ["Heartbeat", "Periodic “I'm alive” message from the leader."],
      ["Fencing token", "A number that lets nodes reject actions from outdated leaders."],
    ],
    quiz: [
      { q: "Why are election timeouts randomized?", a: ["Security", "So one follower usually times out first instead of everyone at once", "To save battery", "To pick the fastest node"], c: 1, why: "Avoids split votes and network storms." },
      { q: "A voter's log is more up to date than the candidate's. It should…", a: ["Vote yes", "Vote no (but still adopt the higher term)", "Become leader", "Ignore the term"], c: 1, why: "Leaders must have all committed entries." },
    ],
  },
  {
    n: 30, id: "FByzF2D_-KU", duration: 654,
    title: "Raft: Writes",
    fullTitle: "Distributed Consensus - Raft Writes | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "The leader appends a write and ships it with its **prefix**. Followers accept only if their log matches up to that point. Once a **majority** has it, it's committed.",
    visuals: [
      {
        type: "cells", title: "Backfilling a stale follower",
        caption: "The follower rejects “I have c21 at index 2”. The leader backs up to b20, then sends the suffix c21, d22.",
        rows: [
          { label: "leader", cells: [{ t: "a19", s: "good" }, { t: "b20", s: "good" }, { t: "c21", s: "hl" }, { t: "d22", s: "hl" }] },
          { label: "follower", cells: [{ t: "a19", s: "good" }, { t: "b20", s: "good" }, { t: "d20", s: "bad" }] },
          { label: "after", cells: [{ t: "a19", s: "good" }, { t: "b20", s: "good" }, { t: "c21", s: "good" }, { t: "d22", s: "good" }] },
        ],
      },
      {
        type: "procon", proTitle: "Raft gives you", conTitle: "But",
        pros: ["Fault-tolerant **linearizable** storage", "Foundation for locks, leader election, config"],
        cons: ["**Slow**: every write (often every read) goes through one leader", "Replicates one log; doesn't replace **two-phase commit** for cross-partition transactions"],
      },
    ],
    points: [
      { h: "The log-matching invariant", t: "One leader per term, and writes backfill logs. So if two logs have the same term at the same index, they're **identical up to that index** (the prefix)." },
      { h: "How a write replicates", t: "The leader sends “my previous entry is c21 @ 2, append d22”. A follower that disagrees says no, so the leader steps back one entry and resends the longer suffix, until they match." },
      { h: "Committing", t: "When a **majority** acknowledges, the leader commits and tells followers to commit, similar to a two-phase commit but needing only a majority." },
      { h: "Use it narrowly", t: "Consensus is correct but bottlenecked on one node. Use it for the small, critical parts of a system (locks, metadata, leader election), not as your main database." },
    ],
    takeaway: "Raft = elect a leader + replicate a log with prefix checks + commit on majority. The result is correct and fault tolerant, but slow.",
    terms: [
      ["Prefix / suffix", "The matching part of two logs / the part after it that needs sending."],
      ["Committed entry", "A log entry stored on a majority; it will never be lost."],
    ],
    quiz: [
      { q: "When is a Raft write committed?", a: ["When the leader writes it", "When every node has it", "When a majority has it", "After a timeout"], c: 2, why: "Majorities guarantee future leaders have it." },
      { q: "Why doesn't Raft replace two-phase commit?", a: ["It's slower", "Raft replicates one identical log; 2PC coordinates different writes across partitions", "Raft has no leader", "2PC is linearizable"], c: 1, why: "Different problems." },
    ],
  },
  {
    n: 31, id: "F06tdYgcz_A", duration: 452,
    title: "ZooKeeper & Coordination Services",
    fullTitle: "What is ZooKeeper? - Coordination Services | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "Coordination services (**ZooKeeper**, **etcd**) are small, consensus-backed key-value stores for **configuration** that must be correct: who's leader, which partition is where, server addresses.",
    visuals: [
      {
        type: "flow", caption: "Your app data lives in a fast, scalable DB. The critical config lives in the consensus-backed coordination service.",
        nodes: [
          { id: "app", label: "App servers", x: 0, y: 0.5, kind: "client" },
          { id: "zk", label: "ZooKeeper / etcd", sub: "leader, shards, IPs", x: 1.3, y: 0, kind: "accent" },
          { id: "db", label: "Main database", sub: "posts, comments…", x: 1.3, y: 1, kind: "db" },
        ],
        edges: [{ from: "app", to: "zk", label: "config" }, { from: "app", to: "db", label: "data" }, { from: "db", to: "zk", style: "dash", label: "who's leader?" }],
      },
      {
        type: "lanes", title: "Linearizable reads from a follower with `sync`",
        lanes: ["Client", "Leader log", "Follower"],
        rows: [
          ["read x=5 (index 1)", "…x=5 @1", "stale @0"],
          ["write `sync`", "sync @2", ""],
          ["", "", "catches up to @2"],
          [{ t: "read follower once it shows sync ✓", s: "good" }, "", ""],
        ],
      },
    ],
    points: [
      { h: "What goes in it", t: "IP addresses of servers, DBs and load balancers; the replication setup and current leader; the partition map. Getting this wrong corrupts everything, so it's worth paying for consensus." },
      { h: "Built on consensus", t: "etcd runs Raft. ZooKeeper runs Zab (Raft-like). Writes go through a leader and commit on a majority." },
      { h: "Linearizable reads", t: "Option 1: always read from the leader (simple but a bottleneck). Option 2 (ZooKeeper): write a **sync** marker and read from a follower once it has caught up past it. That gives more read throughput." },
      { h: "Keep it small", t: "It's too slow for main application data. Use a scalable DB for that, and a coordination service for the config that DB relies on." },
    ],
    takeaway: "Put small, critical, must-be-correct metadata in ZooKeeper/etcd. Everything else goes in faster, more scalable stores.",
    terms: [
      ["Coordination service", "A consensus-backed store for cluster configuration and coordination (locks, leader election, service discovery)."],
      ["etcd / ZooKeeper", "Popular coordination services (Raft / Zab)."],
      ["Service discovery", "Finding where services and nodes currently live."],
    ],
    quiz: [
      { q: "Which data belongs in ZooKeeper?", a: ["User posts", "Which node is the current DB leader", "Video files", "Analytics events"], c: 1, why: "Small, critical configuration." },
      { q: "How can ZooKeeper serve linearizable reads from followers?", a: ["It can't", "Client writes a sync marker and reads once the follower has it", "Using timestamps", "Using CRDTs"], c: 1, why: "Then the follower is at least as fresh as what the client has seen." },
    ],
  },
]);
