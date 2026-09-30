/* Lessons 46–50 · Specialized Indexes
 * Summaries of "Systems Design 2.0" by Jordan has no life. All credit to him. */
window.LESSONS = (window.LESSONS || []).concat([
  {
    n: 46, id: "ty9DQhM32mM", duration: 434,
    title: "Search Indexes",
    fullTitle: "Search Indexes - Why do we need them? | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "A normal index sorts by the whole text, so “apple” in the middle of a string is unfindable. A search index **tokenizes** text into an **inverted index**: term → documents.",
    visuals: [
      {
        type: "steps", title: "From document to inverted index",
        items: [
          ["Document", "`#92: “Apple™ Computer”`"],
          ["Tokenize", "Lowercase, strip symbols, split into words → `apple`, `computer`."],
          ["Inverted index", "Sorted terms, each with a list of doc IDs: `apple → [92, 17]`, `computer → [92]`."],
        ],
      },
      {
        type: "cells", title: "Suffix search: index reversed words too",
        caption: "“*berry” → search the reversed index for prefix “yrreb”.",
        rows: [
          { label: "prefix idx", cells: ["apple", "blackberry", "blueberry", "raspberry"] },
          { label: "suffix idx", cells: ["elppa", { t: "yrrebeulb", s: "hl" }, { t: "yrrebkcalb", s: "hl" }, { t: "yrrebpsar", s: "hl" }] },
        ],
      },
    ],
    points: [
      { h: "Why DB indexes fail at search", t: "A B-tree on a text column sorts by the first characters. A listing that merely **contains** “apple” can sit anywhere, so you're back to scanning." },
      { h: "Inverted index", t: "Tokenize every document and map each **term → list of document IDs**. Keep terms sorted, so a **prefix** search (all terms starting with “c”) is a binary search." },
      { h: "Suffix search", t: "Keep a second inverted index of **reversed** terms. Searching for words ending in “berry” becomes a prefix search for “yrreb”." },
      { h: "Apache Lucene", t: "The popular open-source search library, built on an LSM-tree-like architecture. It also does fuzzy matching (Levenshtein distance), geo, numeric and date search. It's single-node only, so the next lesson covers distributing it." },
    ],
    takeaway: "Full-text search needs an inverted index (e.g. Lucene), not a database index.",
    terms: [
      ["Tokenization", "Normalizing and splitting text into searchable terms."],
      ["Inverted index", "Map from each term to the documents containing it."],
      ["Lucene", "Open-source search index library underlying Elasticsearch."],
    ],
    quiz: [
      { q: "Why can't a B-tree on `description` find listings containing “apple” quickly?", a: ["B-trees don't store text", "It's sorted by the start of the string, and the word can be anywhere", "It's too small", "It's in memory"], c: 1, why: "Substring matches aren't contiguous in that order." },
      { q: "How do you efficiently find all words ending in “ing”?", a: ["Scan everything", "Prefix-search “gni” in a reversed-term index", "Use a hash index", "Use a Bloom filter"], c: 1, why: "Reverse the terms, then do a prefix search." },
    ],
  },
  {
    n: 47, id: "wmCWCVAl1Us", duration: 421,
    title: "Elasticsearch",
    fullTitle: "What's ElasticSearch Used For? | Search Indexes | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "Elasticsearch wraps Lucene in a managed, distributed service. It uses **local indexes**, so design your partitioning so most searches hit **one partition**.",
    visuals: [
      {
        type: "table", title: "Local vs. global index",
        head: ["", "Local (Elasticsearch)", "Global"],
        rows: [
          ["Each partition indexes…", "Only its own docs", "All docs for its terms"],
          ["Storage", "Yes, lean (no duplicated docs)", "No, docs copied to many partitions"],
          ["Query “cherry”", "Scatter to all partitions, then aggregate (slow)", "One partition"],
        ],
      },
      {
        type: "flow", title: "Partition so a search stays local",
        caption: "Chat search: partition by chatId, so searching one chat touches one node.",
        nodes: [
          { id: "q", label: "Search in chat 42", x: 0, y: 0.5, kind: "client" },
          { id: "p1", label: "Partition A", sub: "chats 1–40", x: 1.3, y: 0, kind: "db" },
          { id: "p2", label: "Partition B", sub: "chats 41–80", x: 1.3, y: 1, kind: "db good" },
        ],
        edges: [{ from: "q", to: "p2", style: "good" }],
      },
    ],
    points: [
      { h: "What it adds to Lucene", t: "A REST API, its own query language, replication and partitioning handled for you, plus visualization and monitoring tooling." },
      { h: "Local indexes", t: "Each partition indexes its own documents. A global index would copy large documents to many partitions and waste space." },
      { h: "The cost: scatter-gather", t: "A term might appear in every partition, so a query fans out and results are aggregated, which adds latency." },
      { h: "Design around it", t: "Partition by what users search within, e.g. **chat ID** for message search. For a store-wide search bar you may have to accept scatter-gather, or narrow by category first." },
      { h: "Smart caching", t: "Elasticsearch caches **parts** of queries. A popular filter like “on sale” is reused even when combined with different search terms." },
    ],
    takeaway: "Elasticsearch = distributed Lucene with local indexes. Pick a partition key that keeps searches on one node.",
    terms: [
      ["Local index", "Each partition indexes only its own data."],
      ["Global index", "Index partitioned by term, spanning all data."],
      ["Scatter-gather", "Query every partition and merge the results."],
    ],
    quiz: [
      { q: "Best partition key for per-chat message search?", a: ["Message ID", "Chat ID", "Timestamp", "Random"], c: 1, why: "Each search then hits one partition." },
      { q: "Downside of Elasticsearch's local indexes?", a: ["Documents are duplicated", "Queries may need to hit every partition", "No replication", "No prefix search"], c: 1, why: "Scatter-gather latency." },
    ],
  },
  {
    n: 48, id: "fUpYLwzGtW0", duration: 486,
    title: "Time-Series Databases",
    fullTitle: "How are Time Series Databases SO FAST? | Systems Design Interview 0 to 1 With Ex-Google SWE",
    bigIdea: "Time-series DBs (TimescaleDB, InfluxDB, Druid) use **column storage** plus **hypertables**: a grid of small chunk tables by *source × time range*.",
    visuals: [
      {
        type: "cells", title: "Hypertable = grid of chunk tables",
        caption: "Cache exactly the chunk you query, write each sensor's chunk locally, drop an old column of chunks to delete.",
        rows: [
          { label: "sensor 1", cells: [{ t: "1–2pm", s: "dim" }, "2–3pm", "3–4pm"] },
          { label: "sensor 2", cells: [{ t: "1–2pm", s: "dim" }, "2–3pm", "3–4pm"] },
          { label: "sensor 3", cells: [{ t: "1–2pm", s: "dim" }, { t: "2–3pm", s: "hl" }, "3–4pm"] },
          { label: "", cells: [{ t: "↑ drop table (cheap delete)", s: "bad" }] },
        ],
      },
      {
        type: "cards",
        items: [
          { icon: "📖", title: "Reads", text: "Columnar storage + cache exactly the hot chunks." },
          { icon: "✍️", title: "Writes", text: "Chunks live near their source; LSM trees absorb writes in memory." },
          { icon: "🗑️", title: "Deletes", text: "Drop a whole chunk file instead of writing millions of tombstones." },
        ],
      },
    ],
    points: [
      { h: "What's time-series data?", t: "Logs, metrics, sensor readings: anything mainly accessed by **time range** (plus source)." },
      { h: "Column-oriented storage", t: "Queries touch one or two of many columns. Columnar layout means better locality, compression and caching." },
      { h: "Hypertables & chunk tables", t: "Split data into small tables per (source, time range), each with its own index. You cache precisely what's hot instead of big index ranges." },
      { h: "Fast writes", t: "Keep a sensor's chunk on the node that ingests it (no network hop) and use LSM trees so writes land in memory first." },
      { h: "Cheap deletes", t: "In LSM trees a delete costs as much as a write (tombstones). Retention policies delete lots of old data, so just **drop whole chunk tables**." },
    ],
    takeaway: "If data is keyed by time and you expire old data, a time-series DB with chunked hypertables wins on reads, writes and deletes.",
    interview: "Don't just say “use a time-series DB”. Explain chunking by source × time, columnar storage, and dropping chunks for retention.",
    terms: [
      ["Hypertable", "Logical table made of many chunk tables partitioned by time (and source)."],
      ["Chunk table", "A small table for one source and time range, with its own index."],
      ["Retention policy", "Automatically deleting data older than some age."],
    ],
    quiz: [
      { q: "Why are deletes cheap in a time-series DB?", a: ["Tombstones are smaller", "Old chunks are dropped as whole files", "They skip the WAL", "Data is in memory"], c: 1, why: "No per-row delete writes." },
      { q: "Why use column-oriented storage for metrics?", a: ["Queries usually need only a few of many columns", "It makes writes faster", "It supports joins", "It avoids partitioning"], c: 0, why: "Better locality and compression." },
    ],
  },
  {
    n: 49, id: "Sdw_D-Gllac", duration: 572,
    title: "Graph Databases (Neo4j)",
    fullTitle: "How are Graph Databases So Fast?? (Neo4j) | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "In a relational DB, each hop across an edge is an index lookup (log n). Native graph DBs store **direct pointers** between nodes and edges: **index-free adjacency**, O(1) per hop.",
    visuals: [
      {
        type: "table", title: "Cost of one hop",
        head: ["Implementation", "How a hop works", "Cost"],
        rows: [
          ["Relational (nodes + edges tables)", "Binary search edges index, then binary search nodes", "O(log E) + O(log N)"],
          ["Document (list of neighbor IDs)", "Read the list, then look each ID up", "O(log N)"],
          ["Native (Neo4j)", "Follow disk/memory address pointers", "Yes, O(1)"],
        ],
      },
      {
        type: "flow", title: "Index-free adjacency",
        caption: "Node → first edge; each edge → target node and → next edge of the same node.",
        nodes: [
          { id: "m", label: "MGK", sub: "firstEdge @10", x: 0, y: 0.5, kind: "client" },
          { id: "e1", label: "Edge @10", sub: "to @2 · next @11", x: 1.2, y: 0, kind: "accent" },
          { id: "e2", label: "Edge @11", sub: "to @3 · next ∅", x: 1.2, y: 1, kind: "accent" },
          { id: "n2", label: "Megan @2", x: 2.4, y: 0, kind: "db" },
          { id: "n3", label: "Kate @3", x: 2.4, y: 1, kind: "db" },
        ],
        edges: [{ from: "m", to: "e1" }, { from: "e1", to: "e2", label: "next" }, { from: "e1", to: "n2" }, { from: "e2", to: "n3" }],
      },
    ],
    points: [
      { h: "Non-native graphs", t: "A graph query language on top of a normal DB. Every traversal step is an index lookup, so it gets **slower as the graph grows**." },
      { h: "Native graphs", t: "Neo4j stores node and edge records with physical addresses. A node points to its first edge, and each edge points to its target and to the next edge. Traversal is pointer-chasing, independent of graph size." },
      { h: "Random access is OK here", t: "Disks prefer sequential access, but eliminating log-factor lookups on every hop is worth it." },
      { h: "ACID across nodes", t: "Multi-node updates need locks + WAL. Across partitions that means a **two-phase commit**, and Neo4j involves only the partitions actually touched." },
    ],
    takeaway: "For deep traversals (social graphs, recommendations, fraud rings), native graph DBs avoid a log-n lookup on every hop.",
    terms: [
      ["Index-free adjacency", "Each node physically references its neighbors, so hops don't need an index."],
      ["Native graph database", "Storage designed around nodes and edges, not tables."],
    ],
    quiz: [
      { q: "Why do relational graph traversals slow down as the graph grows?", a: ["SQL is slow", "Each hop is an O(log n) index lookup", "Joins are forbidden", "No WAL"], c: 1, why: "Pointer-chasing is O(1) instead." },
      { q: "“Index-free adjacency” means…", a: ["No indexes at all in the DB", "Nodes and edges store direct addresses of their neighbors", "Edges are hashed", "Graphs are stored in RAM only"], c: 1, why: "Follow pointers instead of searching." },
    ],
  },
]);
