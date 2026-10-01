/* Lessons 51–60 · Caching, Storage, Networking & Deployment
 * Summaries of "Systems Design 2.0" by Jordan has no life. All credit to him. */
window.LESSONS = (window.LESSONS || []).concat([
  {
    n: 51, id: "crPoHnhkjFE", duration: 655,
    title: "Intro to Distributed Caching",
    fullTitle: "Introduction to Distributed Caching - Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "A cache keeps expensive results in **faster** or **closer** storage. That's quicker reads and less load on the database, at the cost of **misses** and **consistency** headaches.",
    visuals: [
      {
        type: "flow", title: "Where to put the cache",
        caption: "Local cache: on the app server itself. Global cache: a separate tier that scales on its own.",
        nodes: [
          { id: "c", label: "Client", x: 0, y: 0, kind: "client" },
          { id: "lb", label: "Load balancer", sub: "consistent hashing", x: 1.2, y: 0, kind: "accent" },
          { id: "a", label: "App server", sub: "+ local cache", x: 2.4, y: 0 },
          { id: "g", label: "Global cache", sub: "Redis / Memcached", x: 2.4, y: 1.2, kind: "good" },
          { id: "db", label: "Database", x: 1.2, y: 1.2, kind: "db" },
        ],
        edges: [{ from: "c", to: "lb" }, { from: "lb", to: "a" }, { from: "a", to: "g", label: "local miss" }, { from: "g", to: "db", label: "miss" }],
      },
      {
        type: "table",
        head: ["", "Server-local cache", "Global cache layer"],
        rows: [
          ["Extra network hop", "Yes, none", "No, one more hop"],
          ["Scale capacity", "No, tied to # of app servers", "Yes, independently"],
          ["Server dies", "Its cache is gone", "Cache survives"],
          ["Routing", "Needs sticky routing (consistent hashing)", "Any server can use it"],
        ],
      },
    ],
    points: [
      { h: "Why cache", t: "Faster storage (RAM instead of disk), fewer network calls, data physically nearer the user, and a **shield** for the database against many identical requests." },
      { h: "What to cache", t: "Anything expensive to fetch or compute: heavy DB query results, app-server computations, and popular static files (see CDNs)." },
      { h: "The costs", t: "A **miss** is slower than having no cache at all (extra hop + lookup), and cached copies can go **stale**. Changing your password and having the cache reject it is bad." },
      { h: "Local vs. global", t: "A cache on the app server avoids a hop but requires routing users to the same server (consistent hashing) and dies with the server. A separate cache tier scales independently but adds a hop and more moving parts." },
    ],
    takeaway: "Caches trade freshness and complexity for speed. Decide what to cache, where it lives, and how stale it's allowed to be.",
    terms: [
      ["Cache hit / miss", "The data was / wasn't found in the cache."],
      ["Sticky routing", "Sending a user to the same server every time, so their cached data is there."],
    ],
    quiz: [
      { q: "Main advantage of a global caching layer over server-local caches?", a: ["No network hop", "Scales independently of app servers", "Always consistent", "Needs no eviction"], c: 1, why: "Add cache capacity without adding app servers." },
      { q: "Why pair server-local caching with consistent hashing in the load balancer?", a: ["For encryption", "So a user keeps hitting the server that has their cached data", "To avoid the DB", "To evict faster"], c: 1, why: "It maximizes cache hits." },
    ],
  },
  {
    n: 52, id: "ULgXBImWVWQ", duration: 721,
    title: "Cache Write Strategies",
    fullTitle: "Distributed Cache Writes: What You Have To Know | Systems Design Interview 0 to 1 With Ex-Google SWE",
    bigIdea: "Three ways to write with a cache. **Write-around** (DB only), **write-through** (cache + DB together), **write-back** (cache now, DB later). Speed vs. consistency.",
    visuals: [
      {
        type: "table",
        head: ["Strategy", "Write path", "Reads after a write", "Watch out for"],
        rows: [
          ["Write-around", "DB only (optionally **invalidate** the key)", "Stale until TTL, or a miss after invalidation", "First read after a write is a miss"],
          ["Write-through", "Cache and DB", "Fresh", "Slower writes; they can diverge without 2PC"],
          ["Write-back", "Cache only, flushed to DB in batches", "DB readers see stale data", "Data loss if the cache dies before flushing"],
        ],
      },
      {
        type: "meter", metrics: ["Write speed", "Consistency", "Simplicity"],
        items: [
          { name: "Write-around", values: [3, 3, 5] },
          { name: "Write-through", values: [2, 4, 3] },
          { name: "Write-back", values: [5, 1, 2] },
        ],
      },
    ],
    points: [
      { h: "Write-around", t: "Write straight to the DB. Either accept stale cache reads until the entry's **TTL** expires, or actively **invalidate** the key so the next read misses and refills. The DB remains the source of truth." },
      { h: "Write-through", t: "Write to the cache, which also writes the DB. The cache is always warm, but writes are slower, and without **two-phase commit** (even slower) a partial failure can leave them out of sync." },
      { h: "Write-back", t: "Write only to the cache and **batch** writes to the DB later. Fastest writes, but others reading the DB see stale data, and a cache crash loses writes. A distributed lock can fix reads, but it defeats the purpose." },
    ],
    takeaway: "Pick by use case: correctness-critical data means write-around with invalidation, or write-through. Speed-critical data that tolerates loss can use write-back.",
    terms: [
      ["TTL", "Time-to-live: when a cache entry expires."],
      ["Invalidation", "Deleting a cache entry so the next read fetches fresh data."],
    ],
    quiz: [
      { q: "Which strategy risks losing acknowledged writes if the cache crashes?", a: ["Write-around", "Write-through", "Write-back", "None"], c: 2, why: "The DB hasn't received them yet." },
      { q: "With write-around + invalidation, the first read after a write is…", a: ["A cache hit with fresh data", "A cache miss that refills from the DB", "An error", "Stale"], c: 1, why: "The key was deleted from the cache." },
    ],
  },
  {
    n: 53, id: "4wEQ9_tkqvE", duration: 471,
    title: "Cache Eviction Policies",
    fullTitle: "Cache Evictions: Don't Mess Them Up | Systems Design Interview 0 to 1 with Ex-Google SWE",
    bigIdea: "Caches are small, so something must be evicted. **LRU** (least recently used) is the common, sensible default. It's built from a **hashmap + doubly linked list**.",
    visuals: [
      {
        type: "cells", title: "LRU: read “Jordan”, so it moves to the front",
        rows: [
          { label: "before", cells: [{ t: "Gaurav", s: "good" }, "Jordan", "Rogan", { t: "PewDiePie", s: "bad" }] },
          { label: "after", cells: [{ t: "Jordan", s: "hl" }, "Gaurav", "Rogan", { t: "PewDiePie", s: "bad" }] },
          { label: "", cells: [{ t: "newest ←", s: "gap" }, { t: "→ evict from here", s: "gap" }] },
        ],
      },
      {
        type: "table",
        head: ["Policy", "Evicts", "Verdict"],
        rows: [
          ["FIFO (queue)", "The oldest inserted", "No: evicts hot keys just for being old"],
          ["LRU (hashmap + doubly linked list)", "Least recently accessed", "Yes, the go-to default, O(1)"],
          ["LFU (frequency buckets)", "Least frequently accessed", "Some: good for stable popularity, trickier to build"],
          ["Random", "Anything", "Rarely useful, but needs no metadata"],
        ],
      },
    ],
    points: [
      { h: "Why eviction matters", t: "Cache memory is expensive and limited. Evict badly and you throw away data people are about to ask for, which means more misses." },
      { h: "FIFO", t: "Simple queue: evict whatever arrived first. But an entry read 100 times still gets evicted just for being old." },
      { h: "LRU", t: "Move each accessed item to the head and evict from the tail. The **hashmap** finds the node in O(1) and the **doubly linked list** moves it in O(1)." },
      { h: "LFU", t: "Track access counts (lists per frequency) and evict the least used. Good when popularity is stable. It's a LeetCode-hard implementation." },
    ],
    takeaway: "Default to LRU, and know how to implement it: hashmap → node in a doubly linked list; move to front on access, evict from the tail.",
    terms: [
      ["LRU", "Least recently used eviction."],
      ["LFU", "Least frequently used eviction."],
    ],
    quiz: [
      { q: "Which data structures give O(1) LRU operations?", a: ["Array + binary search", "Hashmap + doubly linked list", "Heap", "B-tree"], c: 1, why: "Find with the map, move with the list." },
      { q: "Main flaw of FIFO eviction?", a: ["Too slow", "It evicts frequently used items just because they're old", "Needs too much memory", "Not deterministic"], c: 1, why: "It ignores access patterns." },
    ],
  },
  {
    n: 54, id: "Gyy1SiE8avE", duration: 504,
    title: "Redis vs. Memcached",
    fullTitle: "Redis vs. Memcached - Who Wins? | Systems Design Interview 0 to 1 With Ex-Google SWE",
    bigIdea: "Both are in-memory key-value caches that scale independently. **Memcached** is bare-bones and multi-threaded. **Redis** is feature-rich and single-threaded, with transactions.",
    visual: {
      type: "table",
      head: ["", "Memcached", "Redis"],
      rows: [
        ["Data types", "Plain key → value", "Hashes, sorted sets, geo indexes, …"],
        ["Partitioning", "Consistent hashing ring", "Fixed partitions (slots), placement agreed via gossip"],
        ["Threads", "Multi-threaded", "Single-threaded (actual serial execution)"],
        ["Transactions", "No, DIY locking", "Yes: WAL for atomicity + serial execution for isolation"],
        ["Replication", "Up to you", "Single-leader, built in"],
        ["Eviction", "LRU", "Configurable (LRU etc.)"],
        ["Feels like", "Flexible building block", "Managed, batteries included"],
      ],
    },
    points: [
      { h: "Why a separate cache tier", t: "App-server caches are capped by the server's memory. A dedicated tier grows with demand, or shrinks when you need more databases than cache." },
      { h: "Memcached", t: "A minimal in-memory store: consistent-hash partitioning, multi-threaded, LRU eviction. You build anything fancier yourself." },
      { h: "Redis", t: "Rich in-memory data structures, a fixed number of partitions moved around via gossip when nodes die, a WAL for atomic ops, and single-threaded execution for isolation (like VoltDB). Single-leader replication out of the box." },
      { h: "Choosing", t: "A small team that needs a cache now should pick **Redis**. A complex custom setup (e.g. different replication or locking) might fit **Memcached** better." },
    ],
    takeaway: "Redis for convenience and features, Memcached for simplicity and flexibility. Both are in-memory, so they're fast but limited by RAM.",
    terms: [["Gossip protocol", "Nodes share cluster state with random peers until everyone agrees."]],
    quiz: [
      { q: "How does Redis get isolation for transactions?", a: ["Two-phase locking", "Running commands on a single thread", "SSI", "Quorums"], c: 1, why: "Actual serial execution." },
      { q: "Which one supports sorted sets and geo indexes natively?", a: ["Memcached", "Redis", "Both", "Neither"], c: 1, why: "Redis is the feature-rich one." },
    ],
  },
  {
    n: 55, id: "h5YK640kwXY", duration: 501,
    title: "Content Delivery Networks (CDNs)",
    fullTitle: "Content Delivery Networks - You Need Them | Systems Design Interview 0 to 1 With Ex-Google SWE",
    bigIdea: "A CDN is a **geographically distributed cache for static content** (images, video, audio, HTML), so files are served from a location near the user.",
    visuals: [
      {
        type: "flow", title: "Pull CDN: first request misses, later ones hit",
        nodes: [
          { id: "u1", label: "User A", x: 0, y: 0, kind: "client" },
          { id: "u2", label: "User B", sub: "later", x: 0, y: 1, kind: "client" },
          { id: "cdn", label: "CDN edge", sub: "Chicago", x: 1.3, y: 0.5, kind: "accent" },
          { id: "o", label: "Origin", sub: "object store", x: 2.4, y: 0.5, kind: "db" },
        ],
        edges: [{ from: "u1", to: "cdn", label: "miss" }, { from: "cdn", to: "o", label: "fetch + store" }, { from: "u2", to: "cdn", label: "hit ✓", style: "good" }],
      },
      {
        type: "table",
        head: ["", "Push CDN", "Pull CDN"],
        rows: [
          ["How it fills", "You upload content ahead of time", "Fetches from origin on the first miss"],
          ["Best when", "You know what'll be hot (this month's magazine issue)", "Popularity is unpredictable (TikTok, YouTube, Twitter)"],
          ["Misses", "On content you didn't push", "On every first request per edge"],
        ],
      },
    ],
    points: [
      { h: "Static content", t: "Files written once and never modified. They're often large, so load time matters a lot for user experience." },
      { h: "Geographic sharding", t: "Different regions want different content (Canadian vs. US readers), so each edge caches what its region actually requests. You can also vary resolution or bitrate per edge." },
      { h: "Push vs. pull", t: "Push when you can predict demand. Pull when you can't: a miss proxies to the origin (often over fast data-center links) and stores the file for the next person." },
      { h: "Trade-offs & practice", t: "Reduces origin load and latency, but adds components and slow misses. Usually you **outsource** it (Akamai, Cloudflare) rather than run your own." },
    ],
    takeaway: "Serve images and video through a CDN. Use push for predictable hits and pull for everything else.",
    terms: [
      ["CDN", "Content delivery network: a geo-distributed cache for static files."],
      ["Origin", "The authoritative source the CDN fetches from."],
    ],
    quiz: [
      { q: "For a video app where any upload might go viral, use a…", a: ["Push CDN", "Pull CDN", "Write-back cache", "Graph DB"], c: 1, why: "You can't predict what to pre-load." },
      { q: "A CDN is best for…", a: ["Frequently changing user balances", "Static files like images and video", "Transactions", "Search indexes"], c: 1, why: "Write once, read many, everywhere." },
    ],
  },
  {
    n: 58, id: "hPSsPCNxta4", duration: 702,
    title: "TCP vs. UDP",
    fullTitle: "TCP vs. UDP in 12 minutes | Systems Design Interview 0 to 1 With Ex-Google SWE",
    bigIdea: "**UDP** just fires packets: fast, simple, no guarantees. **TCP** adds a handshake, **reliable ordered delivery**, and **flow + congestion control**.",
    visuals: [
      {
        type: "lanes", title: "TCP three-way handshake",
        lanes: ["Sender", "Receiver"],
        rows: [["SYN seq=x", ""], ["", "ACK x+1, SYN seq=y"], ["ACK y+1", ""], [{ t: "connected ✓", s: "good" }, { t: "connected ✓", s: "good" }]],
      },
      {
        type: "table",
        head: ["", "TCP", "UDP"],
        rows: [
          ["Connection", "Handshake first", "None"],
          ["Delivery", "Reliable, ordered (seq numbers, acks, retries)", "Best effort (checksums only)"],
          ["Flow / congestion control", "Yes", "No"],
          ["Multicast", "No", "Yes"],
          ["Use for", "Typical web apps, APIs", "Video calls, games, live prices"],
        ],
      },
    ],
    points: [
      { h: "UDP", t: "Send packets to an address. It's very fast and supports **multicast**, with checksums to detect corruption. But packets can be lost or reordered, and nothing stops you flooding the network." },
      { h: "TCP reliability", t: "Sequence numbers + acks: if the ack says “expecting a+1” after you sent a+1, resend it. No ack at all? Time out and retry with **exponential backoff**." },
      { h: "Flow control", t: "Don't overflow the **receiver's buffer**. Track in-flight messages against the space the receiver advertises." },
      { h: "Congestion control (AIMD)", t: "Don't overload the **network**. Grow the in-flight window by +1 while things look fine, and halve it at the first sign of trouble." },
      { h: "When UDP wins", t: "Real-time data where a late packet is worthless: video calls, games, stock tickers. A frame that arrives 4 seconds late is useless." },
    ],
    takeaway: "Default to TCP. Choose UDP when freshness beats completeness, or when you need multicast.",
    terms: [
      ["Three-way handshake", "SYN → SYN-ACK → ACK to open a TCP connection."],
      ["Flow control", "Limiting in-flight data to what the receiver can buffer."],
      ["Congestion control (AIMD)", "Additive increase, multiplicative decrease of the sending window."],
    ],
    quiz: [
      { q: "Best protocol for a multiplayer game's position updates?", a: ["TCP", "UDP", "HTTP polling", "SMTP"], c: 1, why: "Late updates are useless; speed matters more." },
      { q: "In AIMD congestion control, on signs of congestion the window…", a: ["Grows by 1", "Is halved", "Resets to max", "Is unchanged"], c: 1, why: "Back off fast, grow slowly." },
    ],
  },
  {
    n: 59, id: "fIwOd4PToAY", duration: 677,
    title: "Long Polling vs. WebSockets vs. Server-Sent Events",
    fullTitle: "Long Polling, Websockets, Server Sent Events - Who Wins? | Systems Design  with Ex-Google SWE",
    bigIdea: "To **push** real-time updates (chat, stock prices, notifications) without the client constantly asking, choose between **long polling**, **WebSockets** and **server-sent events (SSE)**.",
    visuals: [
      {
        type: "table",
        head: ["", "Long polling", "WebSockets", "Server-sent events"],
        rows: [
          ["Direction", "Server → client", "Both ways", "Server → client"],
          ["Connection", "One request per message, then reopen", "Persistent", "Persistent"],
          ["Overhead per message", "High: headers + new connection each time", "Low", "Low"],
          ["Auto-reconnect", "n/a", "No, write it yourself", "Yes, built in"],
          ["Good when", "Updates are rare; widest browser support", "Chat, games: frequent two-way traffic", "Feeds, tickers, notifications"],
        ],
      },
      {
        type: "lanes", title: "Thundering herd: everyone reconnects at once",
        lanes: ["Client 1", "Client 2", "Client 3", "Server"],
        rows: [
          ["connected", "connected", "connected", "up"],
          ["", "", "", { t: "goes down 💥", s: "bad" }],
          [{ t: "reconnect", s: "bad" }, { t: "reconnect", s: "bad" }, { t: "reconnect", s: "bad" }, { t: "back up… overloaded", s: "bad" }],
          [{ t: "retry +3s", s: "good" }, { t: "retry +1s", s: "good" }, { t: "retry +4s", s: "good" }, { t: "random jitter spreads load", s: "good" }],
        ],
      },
    ],
    points: [
      { h: "Plain polling is wasteful", t: "Asking “anything new?” every few seconds burns client battery and server capacity, and most answers are empty, like checking your phone every 2 minutes for a reply that isn't coming." },
      { h: "Long polling", t: "The server **holds** the request open until data exists, responds, and then the client opens a new one. It's one-directional and well supported, but each round trip pays for headers and a new connection. That's fine when updates are rare." },
      { h: "WebSockets", t: "A **persistent, bidirectional** connection: headers once, then lightweight messages both ways. It ties up resources even when idle, and reconnecting after a drop is up to your client code." },
      { h: "Server-sent events", t: "A **persistent, server → client** stream that **reconnects automatically**. The client sends data with normal HTTP requests." },
      { h: "Beware the thundering herd", t: "If a server blips, every client auto-reconnects at the same instant and knocks it over again. Add **random jitter** to reconnect delays, the same trick Raft uses for election timeouts." },
    ],
    takeaway: "Persistent connections (WebSockets, SSE) are fast but cost resources when idle. Auto-reconnect is convenient but needs jitter. Long polling suits infrequent updates.",
    interview: "Pick by direction and frequency: two-way chat → WebSockets; one-way feed → SSE; rare updates → long polling. Mention jittered reconnects.",
    terms: [
      ["Long polling", "The server holds a request open until it has data, then the client re-requests."],
      ["WebSocket", "A persistent, full-duplex connection between client and server."],
      ["Server-sent events (SSE)", "A persistent server-to-client stream with automatic reconnection."],
      ["Thundering herd", "Many clients retrying at the same moment and overwhelming a recovering server."],
    ],
    quiz: [
      { q: "A chat app needs frequent messages in both directions. Best fit?", a: ["Polling", "Long polling", "WebSockets", "Server-sent events"], c: 2, why: "Persistent and bidirectional." },
      { q: "How do you prevent a thundering herd when clients auto-reconnect?", a: ["Reconnect immediately", "Add a random jitter to the reconnect delay", "Use UDP", "Disable reconnects"], c: 1, why: "It spreads the reconnects out over time." },
    ],
  },
  {
    n: 60, id: "kDHb99gTByU", duration: 622,
    title: "Monolith vs. Microservices, Docker & Kubernetes",
    fullTitle: "Monolith Vs. Microservices + Docker + Kubernetes | Systems Design Interview with Ex-Google SWE",
    bigIdea: "Big systems split into **microservices** that deploy and scale independently. **Docker** packages each one, and **Kubernetes** decides where containers run and restarts them when they fail.",
    visuals: [
      {
        type: "procon", proTitle: "Monolith: good at", conTitle: "Monolith: watch out for",
        pros: ["Simple: one repo, one deploy", "Perfect for small apps"],
        cons: ["One bad dependency can take everything down", "Can't scale uploads without also scaling follows, ads…"],
      },
      {
        type: "flow", title: "Kubernetes in one picture",
        nodes: [
          { id: "cp", label: "Control plane", sub: "desired state + etcd", x: 0, y: 0.5, kind: "accent" },
          { id: "h1", label: "Host 1 · kubelet", sub: "pod: upload · pod: ads", x: 1.4, y: 0 },
          { id: "h2", label: "Host 2 · kubelet", sub: "pod: upload · pod: follow", x: 1.4, y: 1 },
        ],
        edges: [{ from: "cp", to: "h1" }, { from: "cp", to: "h2" }],
        nodeW: 170,
      },
    ],
    points: [
      { h: "Monolith", t: "One binary does everything (upload, follow, ads, metrics). It's simple to build and deploy, but it's all-or-nothing for bugs and scaling." },
      { h: "Microservices", t: "Split by function (e.g. an upload service). Scale each by its own load, and teams work independently behind agreed APIs. The cost is more things to deploy and monitor, and more things that can fail." },
      { h: "Docker", t: "A **container** bundles a service with its dependencies and OS libraries, so any host can run it. Unlike VMs, resources don't have to be fixed up front." },
      { h: "Kubernetes", t: "You declare a **desired state**. The control plane (backed by etcd) schedules **pods** onto hosts. Kubelets restart crashed pods, and pods move if a host dies." },
      { h: "Don't over-engineer", t: "“Premature optimization is the root of all evil” (Donald Knuth). A 100-user side project should be a monolith." },
    ],
    takeaway: "At massive scale, microservices + Docker + Kubernetes. At small scale, keep the monolith.",
    terms: [
      ["Container", "A packaged app plus its dependencies that runs consistently on any host."],
      ["Pod", "Kubernetes' smallest deployable unit, running one or more containers."],
      ["Desired state", "What you declare to Kubernetes; it continuously works to make reality match."],
    ],
    quiz: [
      { q: "Photo uploads get 1000× the traffic of follows. What's the microservices advantage?", a: ["Fewer repos", "Scale the upload service independently", "No network calls", "Simpler monitoring"], c: 1, why: "Spend resources where the load is." },
      { q: "Docker vs. Kubernetes?", a: ["Same thing", "Docker packages containers; Kubernetes schedules and heals them across hosts", "Kubernetes builds images; Docker schedules", "Both are databases"], c: 1, why: "They're used together." },
    ],
  },
]);
