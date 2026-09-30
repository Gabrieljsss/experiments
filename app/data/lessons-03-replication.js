/* Lessons 16–24 · Replication
 * Summaries of "Systems Design 2.0" by Jordan has no life. All credit to him. */
window.LESSONS = (window.LESSONS || []).concat([
  {
    n: 16, id: "FIPCDRRBGz4", duration: 686,
    title: "Intro to Replication",
    fullTitle: "Intro to Replication - Systems Design \"Need to Knows\" | Systems Design 0 to 1 with Ex-Google SWE",
    bigIdea: "Replication = keeping **copies of the same data on several machines**. You get no data loss, more throughput, and servers closer to your users.",
    visuals: [
      {
        type: "flow", caption: "Each region reads from its own nearby copy of the data.",
        nodes: [
          { id: "us", label: "US users", x: 0, y: 0, kind: "client" },
          { id: "eu", label: "EU users", x: 0, y: 1, kind: "client" },
          { id: "au", label: "APAC users", x: 0, y: 2, kind: "client" },
          { id: "d1", label: "DB copy", sub: "US", x: 1.3, y: 0, kind: "db" },
          { id: "d2", label: "DB copy", sub: "EU", x: 1.3, y: 1, kind: "db" },
          { id: "d3", label: "DB copy", sub: "APAC", x: 1.3, y: 2, kind: "db" },
        ],
        edges: [
          { from: "us", to: "d1" }, { from: "eu", to: "d2" }, { from: "au", to: "d3" },
          { from: "d1", to: "d2", style: "dash", both: true }, { from: "d2", to: "d3", style: "dash", both: true },
        ],
      },
      {
        type: "table", title: "Sync vs. async replication",
        head: ["", "Synchronous", "Asynchronous"],
        rows: [
          ["Write is done when…", "All replicas confirm", "The first DB confirms"],
          ["Stale reads?", "No (strong consistency)", "Possible (eventual consistency)"],
          ["Write latency", "No, slow (cross-region)", "Yes, fast"],
          ["Common?", "Rare, only when staleness is unacceptable", "Yes, the norm"],
        ],
      },
    ],
    points: [
      { h: "Why one database is fragile", t: "One spilled coffee and you have downtime, possibly lost data. Far-away users are slow, and one box has limited throughput." },
      { h: "What replicas buy you", t: "**Redundancy** (a node dies, others serve), **throughput** (spread reads across copies) and **geo-locality** (a replica near each region)." },
      { h: "Strong vs. eventual consistency", t: "Synchronous replication means no stale reads but slow writes. Asynchronous is fast, but other clients may briefly read old values." },
      { h: "How changes are shipped", t: "Copying SQL statements breaks on non-deterministic calls like `NOW()`. Shipping the WAL ties you to byte-level storage details. The usual answer is a **logical replication log** (“row id 1 → name Jordan”), which any database can apply." },
    ],
    takeaway: "Every large system replicates its data. The real questions are *when* replicas get updated (sync/async) and *who* accepts writes (the next lessons).",
    terms: [
      ["Replica", "A full copy of the data on another node."],
      ["Strong consistency", "Every read sees the latest committed write."],
      ["Eventual consistency", "Replicas converge over time; reads may be briefly stale."],
      ["Logical (replication) log", "A storage-engine-independent record of row changes, used to feed replicas."],
    ],
    quiz: [
      { q: "Why not replicate by just re-running SQL statements on replicas?", a: ["SQL is too large", "Non-deterministic functions like NOW() give different results", "Replicas can't parse SQL", "It breaks indexes"], c: 1, why: "Replicas would diverge." },
      { q: "Most web apps choose asynchronous replication because…", a: ["It avoids all stale reads", "Waiting for every replica on every write is too slow", "It's easier to shard", "It removes the need for a leader"], c: 1, why: "They accept brief staleness for speed." },
    ],
  },
  {
    n: 17, id: "Y29yuEoBmjM", duration: 623,
    title: "Dealing with Stale Reads",
    fullTitle: "Dealing with Stale Reads - Make Your App Better | Systems Design 0 to 1 with Ex-Google SWE",
    bigIdea: "You can't remove all staleness under eventual consistency, but three cheap tricks remove the **most annoying** kinds.",
    visual: {
      type: "table",
      head: ["Anomaly", "What the user sees", "Simple fix"],
      rows: [
        ["Read-your-writes", "“I updated my status… and it still says single?!”", "Read from the replica you wrote to for a while, or from one that has seen your write's timestamp"],
        ["Monotonic reads", "Chat messages appear, then vanish (time goes backwards)", "Always read from the same replica, e.g. `userId % replicas`"],
        ["Consistent prefix", "You see “Sure!” without the question “Lunch?”", "Put causally related writes (replies) on the same partition"],
      ],
    },
    points: [
      { h: "Read your own writes", t: "After a write, route that user's reads to the replica that took the write (say, for 10 seconds). Or tag the write with a time and only read from replicas that have caught up to it. Clocks aren't perfect, but this works most of the time." },
      { h: "Monotonic reads", t: "Hopping between replicas that lag by different amounts makes data go **backwards**. Pin each user to one replica, e.g. `hash(userId) % n`, so you only ever move forward." },
      { h: "Consistent prefix reads", t: "When data is split across partitions, a reply can arrive before the message it answers. Keep **causally dependent** writes (e.g. a reply thread) on the same partition so they replicate in order." },
    ],
    takeaway: "Users don't notice slightly old data they've never seen. They do notice their own write missing, time going backwards, or answers without questions. Fix those three.",
    terms: [
      ["Read-your-writes consistency", "A user always sees their own updates."],
      ["Monotonic reads", "A user never sees older data after seeing newer data."],
      ["Consistent prefix reads", "Writes are seen in an order that respects causality."],
    ],
    quiz: [
      { q: "A user refreshes and sees newer, then older messages. Which guarantee is missing?", a: ["Read-your-writes", "Monotonic reads", "Consistent prefix", "Linearizability"], c: 1, why: "They're reading from replicas with different lag." },
      { q: "Simplest fix for monotonic reads?", a: ["Synchronous replication", "Always route a user to the same replica", "Last-write-wins", "Bigger caches"], c: 1, why: "One replica only moves forward in time." },
    ],
  },
  {
    n: 18, id: "8h-a7TsXw28", duration: 729,
    title: "Single-Leader Replication",
    fullTitle: "Single Leader Replication - how it works | Systems Design 0 to 1 with Ex-Google SWE",
    bigIdea: "All writes go to **one leader**, which streams them to **followers** you can read from. It's simple with no write conflicts, but the leader is a bottleneck and a single point of failure.",
    visuals: [
      {
        type: "flow", caption: "Writes → leader only. Reads → any node. Dashed = async replication log.",
        nodes: [
          { id: "c", label: "Client", x: 0, y: 1, kind: "client" },
          { id: "l", label: "Leader", sub: "log pos 70", x: 1.2, y: 0, kind: "db accent" },
          { id: "f1", label: "Follower", sub: "pos 70", x: 2.4, y: 0, kind: "db" },
          { id: "f2", label: "Follower", sub: "pos 50 → catch up", x: 2.4, y: 1.2, kind: "db" },
        ],
        edges: [
          { from: "c", to: "l", label: "write", style: "accent" },
          { from: "l", to: "f1", style: "dash" }, { from: "l", to: "f2", style: "dash", label: "51…70" },
          { from: "c", to: "f2", label: "read" },
        ],
      },
      {
        type: "cards", title: "When the leader dies",
        items: [
          { icon: "❓", title: "Is it really dead?", text: "Maybe it's just a network blip. It's hard to tell over an async network." },
          { icon: "🕳️", title: "Lost writes", text: "The leader was at 80, the new leader only saw 70. Writes 71–80 vanish." },
          { icon: "🧠🧠", title: "Split brain", text: "The old leader comes back and now two nodes accept writes." },
        ],
      },
    ],
    points: [
      { h: "How it works", t: "Clients write only to the leader. It appends to a replication log that followers apply (usually asynchronously). Anyone can read from any node." },
      { h: "Easy wins", t: "Extra durability and **read throughput** almost for free: just add followers, including ones near distant users." },
      { h: "Follower failure is easy", t: "Each follower remembers its log position (say, 50). When it returns, the leader sends 51→70 and it's caught up." },
      { h: "Leader failure is hard", t: "Failover must decide the leader is really dead, avoid losing un-replicated writes, and prevent **split brain**. Doing this safely requires **distributed consensus** (covered later)." },
    ],
    takeaway: "Single-leader: simple, no write conflicts, scales reads. But write throughput is capped by one node, and failover is tricky.",
    terms: [
      ["Leader / follower", "The one node accepting writes / the nodes copying from it."],
      ["Failover", "Promoting a follower when the leader dies."],
      ["Split brain", "Two nodes both believe they're the leader."],
    ],
    quiz: [
      { q: "What does single-leader replication NOT improve?", a: ["Read throughput", "Durability", "Write throughput", "Geographic read latency"], c: 2, why: "All writes still go through one node." },
      { q: "A follower was offline at log position 50; the leader is at 70. Recovery?", a: ["Rebuild from scratch", "Leader sends entries 51–70", "Promote it to leader", "Discard writes 51–70"], c: 1, why: "Log positions make catch-up easy." },
    ],
  },
  {
    n: 19, id: "tffuvQtiTwY", duration: 818,
    title: "Multi-Leader Replication",
    fullTitle: "Multi Leader Replication - chaos | Systems Design 0 to 1 with Ex-Google SWE",
    bigIdea: "Several leaders accept writes, which is great for write throughput and multi-region setups. But concurrent writes to the same key cause **write conflicts**, and timestamps can't reliably settle them.",
    visuals: [
      {
        type: "table", title: "How leaders talk to each other",
        head: ["Topology", "One node dies", "Gotcha"],
        rows: [
          ["Circle", "No, the chain breaks", "Single failure stops propagation"],
          ["Star", "Some: fine unless it's the center", "Center is a single point of failure"],
          ["All-to-all", "Yes, fine", "Messages can arrive out of causal order"],
        ],
      },
      {
        type: "flow", title: "A write conflict",
        nodes: [
          { id: "a", label: "User A", sub: "Jordan = alpha", x: 0, y: 0, kind: "client" },
          { id: "b", label: "User B", sub: "Jordan = beta", x: 0, y: 1, kind: "client" },
          { id: "l1", label: "Leader 1", x: 1.2, y: 0, kind: "db" },
          { id: "l2", label: "Leader 2", x: 1.2, y: 1, kind: "db" },
        ],
        edges: [{ from: "a", to: "l1" }, { from: "b", to: "l2" }, { from: "l1", to: "l2", both: true, style: "bad", label: "which wins?" }],
      },
    ],
    points: [
      { h: "Why multiple leaders", t: "Users in Europe, North America and Africa each write to a nearby leader. You get more write throughput and lower latency." },
      { h: "Don't loop forever", t: "In a multi-leader mesh, the replication log tags each write with **which nodes have seen it**, so it isn't re-sent or applied twice." },
      { h: "Conflict avoidance", t: "Send all writes for a given key to the same leader. That's effectively **partitioning**, and it gives up some of the latency benefit." },
      { h: "Last-write-wins is shaky", t: "Client clocks can be faked. Server clocks drift (quartz skew), and **NTP** corrections can jump time backwards. With LWW, a real write can silently lose." },
    ],
    takeaway: "Multi-leader boosts write throughput but gives you conflicts. Next: detecting truly concurrent writes, and data types that merge themselves.",
    terms: [
      ["Write conflict", "Two leaders accept different values for the same key concurrently."],
      ["Last write wins (LWW)", "Keep the value with the latest timestamp and discard the rest."],
      ["Clock skew", "Machines' clocks disagree; NTP only partly fixes it."],
    ],
    quiz: [
      { q: "Which topology survives any single node failure?", a: ["Circle", "Star", "All-to-all", "None"], c: 2, why: "Every leader talks to every other." },
      { q: "Why is last-write-wins risky?", a: ["Timestamps are too big", "Clocks drift and jump, so a later write can lose", "It needs a leader", "It's too slow"], c: 1, why: "Wall clocks in distributed systems aren't reliable." },
    ],
  },
  {
    n: 20, id: "sa4BJAFT8sU", duration: 684,
    title: "Dealing with Write Conflicts",
    fullTitle: "Dealing with Write Conflicts - What do you do? | Systems Design 0 to 1 with Ex-Google SWE",
    bigIdea: "**Version vectors** track how many writes each node has seen. Comparing them tells you if one write came after another or if they were **concurrent**.",
    visuals: [
      {
        type: "cells", title: "Distributed counter with a version vector",
        caption: "Taking max(3,5) gives 5, which is wrong. Merging the per-leader counts gives [3,5] → 8.",
        rows: [
          { label: "Leader 1", cells: [{ t: "[3, 0]", s: "hl" }, { t: "= 3", s: "gap" }] },
          { label: "Leader 2", cells: [{ t: "[0, 5]", s: "hl" }, { t: "= 5", s: "gap" }] },
          { label: "merged", cells: [{ t: "[3, 5]", s: "good" }, { t: "= 8 ✓", s: "gap" }] },
        ],
      },
      {
        type: "table", title: "Comparing vectors",
        head: ["A", "B", "Relation"],
        rows: [
          ["[2,1,2]", "[1,1,1]", "A ≥ B everywhere → A happened after B"],
          ["[5,2]", "[4,3]", "Mixed → **concurrent**, a real conflict"],
          ["[1,0]", "[0,1]", "Mixed → concurrent"],
        ],
      },
    ],
    points: [
      { h: "Concurrent ≠ same instant", t: "Two writes are **concurrent** if neither knew about the other. It doesn't matter if they were milliseconds or minutes apart." },
      { h: "Version vectors", t: "Each node keeps a list: “I've seen x writes from leader 1, y from leader 2…”. Merging takes the element-wise max, so overlapping updates are never double-counted." },
      { h: "Detecting concurrency", t: "If one vector is ≥ the other in every slot, it's newer. If each is bigger somewhere, the writes are concurrent." },
      { h: "Resolving: siblings or merge", t: "Store both values (**siblings**, e.g. `cute | scary`) and let the app or user choose later, or use data types that merge automatically (**CRDTs**)." },
    ],
    takeaway: "Don't guess with timestamps. Detect concurrency with version vectors, then keep siblings or merge automatically.",
    terms: [
      ["Version vector", "Per-node counters describing which writes a replica has seen."],
      ["Siblings", "Multiple concurrent values stored for one key until resolved."],
      ["CRDT", "Conflict-free replicated data type: merges concurrent updates automatically."],
    ],
    quiz: [
      { q: "Vectors [5,2] and [4,3]. The writes are…", a: ["[5,2] is newer", "[4,3] is newer", "Concurrent", "Identical"], c: 2, why: "Each is ahead in one slot." },
      { q: "Two leaders count 3 and 5 increments independently. Correct merged total?", a: ["5", "3", "8", "15"], c: 2, why: "Sum per-leader counts: [3,5] → 8." },
    ],
  },
  {
    n: 21, id: "FG5Varj1Ows", duration: 989,
    title: "CRDTs: Conflict-Free Data Types",
    fullTitle: "CRDTs - Stop Worrying About Write Conflicts | Systems Design 0 to 1 with Ex-Google SWE",
    bigIdea: "CRDTs are data structures (counters, sets, even lists) designed so replicas can **merge concurrent updates automatically** and always converge.",
    visuals: [
      {
        type: "table", title: "Two flavors",
        head: ["", "Operation-based", "State-based"],
        rows: [
          ["Sends", "Small ops like `inc(0)`", "Whole state, e.g. `[5,4]`"],
          ["Network cost", "Yes, O(1)", "No, grows with state"],
          ["Needs", "Causal delivery, no drops or duplicates", "Merge that's commutative, associative, idempotent"],
          ["Pairs with", "Reliable broadcast", "**Gossip** protocols"],
        ],
      },
      {
        type: "cells", title: "Observed-remove set: tag every add",
        caption: "Removing ham#123 doesn't cancel a later ham#241, so items can be re-added.",
        rows: [
          { label: "adds", cells: [{ t: "ham#123", s: "dim" }, "eggs#762", { t: "ham#241", s: "good" }] },
          { label: "removes", cells: [{ t: "ham#123", s: "bad" }] },
          { label: "set", cells: [{ t: "eggs", s: "hl" }, { t: "ham", s: "hl" }] },
        ],
      },
    ],
    points: [
      { h: "Where they're used", t: "Riak (a leaderless key-value store) and Redis Enterprise (sets) use CRDTs. Sequence CRDTs power collaborative editors like Google Docs." },
      { h: "Operation-based CRDTs", t: "Send tiny operations. But `remove ham` arriving before `add ham` breaks, and re-delivering `add` isn't idempotent. You need **causal, exactly-once** delivery." },
      { h: "State-based CRDTs + gossip", t: "Send the whole state and merge it. Order and duplicates don't matter, so a **gossip protocol** (each node tells a few random nodes, round after round) eventually spreads it everywhere." },
      { h: "Building blocks", t: "**Grow-only counter**: vector of increments. **PN-counter**: separate increment and decrement vectors. **Set**: add-set minus remove-set, with unique tags so items can be re-added." },
    ],
    takeaway: "When concurrent writes are expected, choose a CRDT-shaped data type and let the database merge instead of making users resolve conflicts.",
    terms: [
      ["Idempotent", "Applying the same thing twice has the same effect as once."],
      ["Gossip protocol", "Nodes repeatedly share updates with random peers until everyone has them."],
      ["PN-counter", "A CRDT counter supporting increment and decrement."],
    ],
    quiz: [
      { q: "Why do state-based CRDTs work well with gossip?", a: ["They're smaller", "Their merge is commutative, associative and idempotent, so order and duplicates don't matter", "They need a leader", "They use timestamps"], c: 1, why: "Messages can arrive in any order, any number of times." },
      { q: "Why tag each set add with a unique ID?", a: ["To save space", "So a removed item can be added again", "To sort the set", "For encryption"], c: 1, why: "A remove only cancels the specific tagged adds it saw." },
    ],
  },
  {
    n: 22, id: "Jy4Cm2WEZVg", duration: 651,
    title: "Leaderless Replication",
    fullTitle: "Leaderless Replication Introduction | Systems Design 0 to 1 with Ex-Google SWE",
    bigIdea: "No leader at all: clients **write to several nodes** and **read from several nodes**, and pick the value with the highest version.",
    visual: {
      type: "flow", caption: "Reads repair stale nodes. Anti-entropy syncs replicas in the background using Merkle trees.",
      nodes: [
        { id: "w", label: "Writer", x: 0, y: 0, kind: "client" },
        { id: "n1", label: "Node 1", sub: "v7", x: 1.1, y: 0, kind: "db" },
        { id: "n2", label: "Node 2", sub: "v7", x: 1.1, y: 1, kind: "db" },
        { id: "n3", label: "Node 3", sub: "v6 (stale)", x: 1.1, y: 2, kind: "db hot" },
        { id: "r", label: "Reader", x: 0, y: 2, kind: "client" },
      ],
      edges: [
        { from: "w", to: "n1" }, { from: "w", to: "n2" },
        { from: "r", to: "n2", label: "read v7" }, { from: "r", to: "n3", label: "repair → v7", style: "good" },
      ],
    },
    points: [
      { h: "Write to many, read from many", t: "A client sends each write to several replicas and each read to several replicas. The response with the **highest version number** wins." },
      { h: "Read repair", t: "If a reader notices a replica returned an old version, it writes the newer value back to that replica." },
      { h: "Anti-entropy", t: "In the background, replicas compare their data, efficiently via **Merkle trees** (hashes of ranges), and send each other missing writes." },
      { h: "Trade-offs", t: "Decent write throughput (no single leader) and no failover drama. But reads hit many nodes, and write conflicts are still possible." },
    ],
    takeaway: "Leaderless replication (Dynamo-style: Cassandra, Riak) avoids leader failover, and relies on read repair, anti-entropy and quorums to stay correct.",
    terms: [
      ["Read repair", "A reader fixes stale replicas it noticed during a read."],
      ["Anti-entropy", "Background process that syncs replicas."],
      ["Merkle tree", "Tree of hashes that lets two nodes find differing ranges quickly."],
    ],
    quiz: [
      { q: "A reader gets v7 from one node and v6 from another. What should happen?", a: ["Return v6", "Return v7 and write v7 back to the stale node", "Fail the read", "Average them"], c: 1, why: "That's read repair." },
      { q: "What do Merkle trees speed up?", a: ["Writes", "Finding which data differs between replicas", "Leader election", "Compaction"], c: 1, why: "Compare hashes top-down and only drill into mismatches." },
    ],
  },
  {
    n: 23, id: "DAONthD50g0", duration: 650,
    title: "Quorums",
    fullTitle: "Quorums - Leaderless Replication Continued | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "With **n** replicas, write to **w**, read from **r**. If **w + r > n**, every read overlaps at least one node with the latest write. That's close to strong consistency, but **not quite**.",
    visuals: [
      {
        type: "cells", title: "n = 5, w = 3, r = 3 → overlap guaranteed",
        rows: [
          { label: "written", cells: [{ t: "N1", s: "hl" }, { t: "N2", s: "hl" }, { t: "N3", s: "hl" }, "N4", "N5"] },
          { label: "read", cells: [{ t: "N1", s: "dim" }, { t: "N2", s: "dim" }, { t: "N3", s: "good" }, { t: "N4", s: "hl" }, { t: "N5", s: "hl" }] },
        ],
        caption: "Any 3 reads out of 5 must include at least one of the 3 written nodes (3 + 3 > 5).",
      },
      {
        type: "cards", title: "Why quorums still aren't strongly consistent",
        items: [
          { icon: "🏁", title: "Races", text: "Concurrent writes land in different orders on different nodes, so two quorum readers can disagree." },
          { icon: "💥", title: "Partial failure", text: "A write reaches 1 of the 2 needed nodes. It “failed” but isn't rolled back, so some readers see it." },
          { icon: "🧳", title: "Sloppy quorums", text: "Home cluster down, writes go elsewhere. Readers back home miss them until a **hinted handoff**." },
        ],
      },
    ],
    points: [
      { h: "The math", t: "If `w + r > n`, the set of nodes you read and the set that took the latest write must intersect. Pick the highest version and you see the latest value." },
      { h: "Tunable", t: "Change w and r to trade off: a small w means fast writes, a small r means fast reads, as long as the sum stays above n." },
      { h: "Edge cases break it", t: "Races, partially-failed writes that aren't rolled back, and sloppy quorums all let two readers see different values at the same time." },
      { h: "When to use it", t: "Great for apps that can tolerate an occasional anomaly (social feeds). For money-grade correctness you need **consensus** instead." },
    ],
    takeaway: "Quorums (w + r > n) usually give you the latest value, but “usually” isn't a guarantee.",
    interview: "Say it precisely: “Quorum reads and writes (w + r > n) make stale reads unlikely, but they're not linearizable because of races, partial writes and sloppy quorums.”",
    terms: [
      ["Quorum", "Enough nodes that read and write sets must overlap: w + r > n."],
      ["Sloppy quorum", "Accepting writes on nodes outside the key's usual home set during outages."],
      ["Hinted handoff", "Later moving those writes back to their proper home nodes."],
    ],
    quiz: [
      { q: "n = 3. Which (w, r) forms a quorum?", a: ["(1, 1)", "(1, 2)", "(2, 2)", "(2, 1)"], c: 2, why: "2 + 2 = 4 > 3. The others only sum to 2 or 3, which isn't more than n." },
      { q: "Are quorum systems strongly consistent?", a: ["Yes, always", "No, races, partial writes and sloppy quorums break it", "Only with w = 1", "Only with async replication"], c: 1, why: "They're close, but not guaranteed." },
    ],
  },
  {
    n: 24, id: "uvRcYQ8fdMs", duration: 545,
    title: "Replication Summarized",
    fullTitle: "Replication Summarized in 9 Minutes | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "Three replication styles, three trade-off profiles. Pick based on **write throughput** needs versus how much **conflict handling** you can stomach.",
    visuals: [
      {
        type: "meter", title: "At a glance (5 = best)",
        metrics: ["Write throughput", "Read throughput", "No conflicts", "Failure handling"],
        items: [
          { name: "Single-leader", values: [1, 4, 5, 2] },
          { name: "Multi-leader", values: [5, 4, 1, 4] },
          { name: "Leaderless (quorums)", values: [3, 2, 2, 4] },
        ],
      },
      {
        type: "procon", proTitle: "Replication gives you", conTitle: "Replication costs you",
        pros: ["**Durability**: nuke a data center and you still have copies", "**Throughput**: spread reads (and sometimes writes)", "**Locality**: a replica near each user base"],
        cons: ["Eventual consistency and stale reads", "Leader failover / split brain (single-leader)", "Write conflicts (multi-leader, leaderless)"],
      },
    ],
    points: [
      { h: "Single-leader", t: "All writes go to one node: no conflicts, but low write throughput and a leader that's a single point of failure. Usually eventually consistent." },
      { h: "Multi-leader", t: "High write throughput and great for multi-region setups. You must handle conflicts: version vectors + siblings, or CRDTs. Timestamps alone lose data." },
      { h: "Leaderless", t: "Write and read to several nodes with quorums. Medium write throughput, lower read throughput (you wait on many nodes), and conflicts are still possible. Kept in sync by read repair and anti-entropy." },
    ],
    takeaway: "No free lunch. For correctness-critical systems you'll need distributed consensus, which is coming up in the Consistency & Consensus module.",
    terms: [["Replication schema", "The pattern for who accepts writes and how they flow: single-leader, multi-leader or leaderless."]],
    quiz: [
      { q: "Which approach has zero write conflicts?", a: ["Single-leader", "Multi-leader", "Leaderless", "All of them"], c: 0, why: "One node orders all writes." },
      { q: "Why is leaderless read throughput relatively low?", a: ["It's single-threaded", "Each read waits on several nodes, including the slowest one", "It needs locks", "It uses LWW"], c: 1, why: "Reads fan out to r nodes." },
    ],
  },
]);
