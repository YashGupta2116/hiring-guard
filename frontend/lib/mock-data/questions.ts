import { Question } from "../types";

export const MOCK_QUESTIONS: Question[] = [
  {
    id: "q-1",
    title: "Implement an LRU Cache with O(1) Operations",
    category: "Coding",
    difficulty: "Medium",
    skills: ["Data Structures", "Doubly Linked List", "Hash Map"],
    expectedTimeMinutes: 30,
    tags: ["Caching", "O(1)", "Algorithms"],
    description: "Design a data structure that follows the constraints of a Least Recently Used (LRU) cache. Implement LRUCache class with get(key) and put(key, value) in O(1) time complexity.",
    starterCode: {
      typescript: `class LRUCache {
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get(key: number): number {
    // Your code here
    return -1;
  }

  put(key: number, value: number): void {
    // Your code here
  }
}

// Example usage:
const cache = new LRUCache(2);
cache.put(1, 1);
cache.put(2, 2);
console.log("get 1:", cache.get(1)); // returns 1
cache.put(3, 3); // evicts key 2
console.log("get 2:", cache.get(2)); // returns -1 (not found)`,
      python: `class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity

    def get(self, key: int) -> int:
        # Your code here
        return -1

    def put(self, key: int, value: int) -> None:
        # Your code here
        pass`,
      javascript: `class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
  }

  get(key) {
    // Your code here
    return -1;
  }

  put(key, value) {
    // Your code here
  }
}`,
    },
    testCases: [
      { input: "put(1,10), put(2,20), get(1)", expectedOutput: "10", description: "Basic get retrieves stored value" },
      { input: "put(3,30), get(2)", expectedOutput: "-1", description: "Eviction removes least recently used item (key 2)" },
      { input: "put(4,40), get(1)", expectedOutput: "10", description: "Previously accessed item (1) is retained" },
    ],
    evaluationRubric: [
      "Mentions combining Hash Map with Doubly Linked List for true O(1)",
      "Handles edge case when capacity is 1 or key is updated in place",
      "Avoids memory leaks with node detachment",
    ],
  },
  {
    id: "q-2",
    title: "Design a Distributed Rate Limiter (Token Bucket / Sliding Window)",
    category: "System Design",
    difficulty: "Hard",
    skills: ["Distributed Systems", "Redis", "Concurrency"],
    expectedTimeMinutes: 45,
    tags: ["High Throughput", "Rate Limiting", "Architecture"],
    description: "Design an API rate limiter capable of handling 500,000 RPS across multi-region edge nodes with tenant-level quotas and burst allowances.",
    starterCode: {
      typescript: `interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitResult {
  allowed: boolean;
  remainingRequests: number;
  resetTimeMs: number;
}

async function checkRateLimit(clientId: string, config: RateLimitConfig): Promise<RateLimitResult> {
  // Outline Redis sliding window log / token bucket script
  return { allowed: true, remainingRequests: 10, resetTimeMs: Date.now() + 1000 };
}`,
    },
    evaluationRubric: [
      "Addresses race conditions using Redis Lua script or atomics",
      "Discusses clock drift across distributed edge nodes",
      "Explains fallback degradation strategy when Redis cluster is degraded",
    ],
  },
  {
    id: "q-3",
    title: "Detecting Cycle in Directed Graph & Topological Sort",
    category: "Coding",
    difficulty: "Medium",
    skills: ["Graphs", "DFS", "Topological Sort"],
    expectedTimeMinutes: 25,
    tags: ["Graph Theory", "DFS", "Kahn's Algorithm"],
    description: "Given numCourses and a list of prerequisite pairs, return the ordering of courses you should take to finish all courses. If impossible due to a cycle, return an empty array.",
    starterCode: {
      typescript: `function findOrder(numCourses: number, prerequisites: number[][]): number[] {
  // Your code here
  return [];
}`,
      python: `def findOrder(numCourses: int, prerequisites: list[list[int]]) -> list[int]:
    # Your code here
    return []`,
    },
    testCases: [
      { input: "numCourses=2, prerequisites=[[1,0]]", expectedOutput: "[0,1]", description: "Simple prerequisite sequence" },
      { input: "numCourses=2, prerequisites=[[1,0],[0,1]]", expectedOutput: "[]", description: "Mutual dependency cycle detected" },
      { input: "numCourses=4, prerequisites=[[1,0],[2,0],[3,1],[3,2]]", expectedOutput: "[0,1,2,3] or [0,2,1,3]", description: "Diamond DAG valid topological sort" },
    ],
    evaluationRubric: [
      "Identifies graph representation (adjacency list vs matrix)",
      "Implements either Kahn's BFS in-degree or 3-state DFS (unvisited, visiting, visited)",
      "Correctly handles disconnected graph components",
    ],
  },
  {
    id: "q-4",
    title: "Optimizing React Re-renders in High-Frequency Telemetry Dashboard",
    category: "Coding",
    difficulty: "Hard",
    skills: ["React 19", "Performance", "Web Workers"],
    expectedTimeMinutes: 35,
    tags: ["Frontend", "Performance", "Virtualization"],
    description: "You have a live streaming dashboard receiving 200 telemetry ticks/second. The UI lags and drops frames. How do you refactor state propagation, batching, and virtualization?",
    starterCode: {
      typescript: `// High-frequency telemetry hook & virtualized consumer
import React, { useState, useEffect, useRef } from "react";

export function useTelemetryStream(socketUrl: string) {
  // Implement throttled ring-buffer or useSyncExternalStore
}
`,
    },
    evaluationRubric: [
      "Uses useSyncExternalStore or ref-based buffer instead of raw useState on every socket tick",
      "Mentions requestAnimationFrame batching or Web Worker offloading",
      "Explains DOM virtualization (e.g. react-window or intersection observer)",
    ],
  },
  {
    id: "q-5",
    title: "Resolving Conflicting Priorities and Scope Creep",
    category: "Behavioral",
    difficulty: "Medium",
    skills: ["Leadership", "Stakeholder Management", "Prioritization"],
    expectedTimeMinutes: 20,
    tags: ["Leadership", "Communication", "Conflict"],
    description: "Describe a situation where engineering quality, security requirements, and an aggressive sales deadline clashed. How did you negotiate tradeoffs?",
    evaluationRubric: [
      "Demonstrates empathy for business outcomes while safeguarding architecture",
      "Clear framework for risk quantification (e.g., tech debt loan agreement)",
      "Follow-up measurement and retrospective discipline",
    ],
  },
  {
    id: "q-6",
    title: "Implement a Thread-Safe In-Memory Key-Value Store",
    category: "Coding",
    difficulty: "Medium",
    skills: ["Concurrency", "Locks", "Data Structures"],
    expectedTimeMinutes: 30,
    tags: ["Concurrency", "Go", "C++", "Mutex"],
    description: "Design an in-memory key-value store supporting concurrent get, put, and delete operations with read-write mutex lock striping to minimize contention.",
    starterCode: {
      typescript: `class ConcurrentStore<K, V> {
  // Implement lock-striped or partitioned map
  get(key: K): V | undefined { return undefined; }
  set(key: K, value: V): void {}
  delete(key: K): boolean { return false; }
}`,
    },
    evaluationRubric: [
      "Understands lock contention vs lock striping/sharding",
      "Recognizes reader-writer lock semantics (RWMutex)",
      "Accounts for memory reclamation / cache clearing",
    ],
  },
  {
    id: "q-7",
    title: "Design a Scalable Webhook Delivery Engine",
    category: "System Design",
    difficulty: "Hard",
    skills: ["Message Queues", "Retry Policies", "Circuit Breaker"],
    expectedTimeMinutes: 45,
    tags: ["Kafka", "RabbitMQ", "Reliability"],
    description: "Design a system that delivers millions of outbound webhooks per day to third-party endpoints with exponential backoff, circuit breaking for failing endpoints, and HMAC signatures.",
    evaluationRubric: [
      "Separates fast ingestion from slow customer endpoints via dead-letter queues",
      "Implements exponential jittered backoff to avoid thundering herd",
      "Secures payloads with HMAC-SHA256 signature headers",
    ],
  },
  {
    id: "q-8",
    title: "Binary Tree Maximum Path Sum",
    category: "Coding",
    difficulty: "Hard",
    skills: ["Recursion", "Trees", "Dynamic Programming"],
    expectedTimeMinutes: 30,
    tags: ["Trees", "Recursion", "Algorithms"],
    description: "A path in a binary tree is a sequence of nodes where each pair of adjacent nodes has an edge. Compute the maximum path sum of any non-empty path.",
    starterCode: {
      typescript: `class TreeNode {
  val: number;
  left: TreeNode | null;
  right: TreeNode | null;
  constructor(val?: number, left?: TreeNode | null, right?: TreeNode | null) {
    this.val = val === undefined ? 0 : val;
    this.left = left === undefined ? null : left;
    this.right = right === undefined ? null : right;
  }
}

function maxPathSum(root: TreeNode | null): number {
  // Your code here
  return 0;
}`,
    },
    testCases: [
      { input: "[1,2,3]", expectedOutput: "6", description: "Simple 3-node path 2 + 1 + 3" },
      { input: "[-10,9,20,null,null,15,7]", expectedOutput: "42", description: "Subtree path 15 + 20 + 7" },
    ],
    evaluationRubric: [
      "Distinguishes between path extending up to parent vs path peaking at current node",
      "Handles negative node values properly (ignoring negative gains with Math.max(0, ...))",
    ],
  },
  {
    id: "q-9",
    title: "Building an Accessible Multi-Select Dropdown from Scratch",
    category: "Coding",
    difficulty: "Medium",
    skills: ["Accessibility (a11y)", "Keyboard Navigation", "ARIA"],
    expectedTimeMinutes: 25,
    tags: ["Frontend", "a11y", "Keyboard"],
    description: "Implement the keyboard navigation and ARIA attributes for a combobox multi-select with roving tabIndex, Escape dismiss, and screen-reader announcements.",
    starterCode: {
      typescript: `// Implement keyboard event handling (ArrowDown, ArrowUp, Enter, Space, Escape)
export function handleComboboxKeyDown(e: React.KeyboardEvent, state: any) {
  // Your accessible dispatch logic
}`,
    },
    evaluationRubric: [
      "Uses aria-expanded, aria-controls, aria-activedescendant properly",
      "Focus trap management when open",
      "Announces tag removal to assistive technologies",
    ],
  },
  {
    id: "q-10",
    title: "Handling a Production Outage Under Critical Customer Pressure",
    category: "Behavioral",
    difficulty: "Medium",
    skills: ["Incident Management", "Communication", "Composure"],
    expectedTimeMinutes: 20,
    tags: ["Incidents", "Post-Mortem", "Leadership"],
    description: "Walk us through an actual production outage you led or mitigated. What was your triage methodology, and how did you conduct the blameless post-mortem?",
    evaluationRubric: [
      "Prioritizes mitigation (rollback/traffic drain) over diagnosing root cause during the outage",
      "Maintains clear incident commander protocol",
      "Blameless retrospective with concrete action items",
    ],
  },
  {
    id: "q-11",
    title: "K-th Largest Element in an Unsorted Stream",
    category: "Coding",
    difficulty: "Easy",
    skills: ["Heap / Priority Queue", "QuickSelect", "Streaming"],
    expectedTimeMinutes: 20,
    tags: ["Heaps", "Algorithms"],
    description: "Design a class to find the kth largest element in a stream. Note that it is the kth largest element in sorted order, not the kth distinct element.",
    starterCode: {
      typescript: `class KthLargest {
  constructor(k: number, nums: number[]) {}
  add(val: number): number {
    return 0;
  }
}`,
    },
    testCases: [
      { input: "k=3, nums=[4,5,8,2], add(3)", expectedOutput: "4", description: "Maintains min-heap of size 3" },
      { input: "add(5)", expectedOutput: "5", description: "Stream addition updates k-th threshold" },
    ],
    evaluationRubric: [
      "Identifies Min-Heap of size K as optimal O(log K) insertion solution",
      "Avoids re-sorting array on every add() call",
    ],
  },
  {
    id: "q-12",
    title: "Zero-Downtime Database Schema Migration Strategy",
    category: "System Design",
    difficulty: "Medium",
    skills: ["PostgreSQL", "Data Engineering", "Blue-Green"],
    expectedTimeMinutes: 30,
    tags: ["Database", "Migrations", "DevOps"],
    description: "You need to rename a column and change a foreign key constraint on a table with 200 million rows under continuous read/write load. Detail the step-by-step expand/contract migration.",
    evaluationRubric: [
      "Outlines the Expand-Contract pattern (Add new column -> Dual write -> Backfill -> Read new -> Drop old)",
      "Considers table lock levels (ACCESS EXCLUSIVE locks) and uses concurrent index creation",
      "Provides rollback contingency at each phase",
    ],
  },
  {
    id: "q-13",
    title: "Merge K Sorted Linked Lists",
    category: "Coding",
    difficulty: "Hard",
    skills: ["Divide and Conquer", "Priority Queue", "Pointers"],
    expectedTimeMinutes: 35,
    tags: ["Algorithms", "Divide & Conquer"],
    description: "You are given an array of k linked-lists lists, each linked-list is sorted in ascending order. Merge all the linked-lists into one sorted linked-list and return it in O(N log K) time.",
    starterCode: {
      typescript: `function mergeKLists(lists: Array<ListNode | null>): ListNode | null {
  // Your code here
  return null;
}`,
    },
    testCases: [
      { input: "[[1,4,5],[1,3,4],[2,6]]", expectedOutput: "[1,1,2,3,4,4,5,6]", description: "Multi-list sorted merge" },
      { input: "[]", expectedOutput: "[]", description: "Empty list array" },
    ],
    evaluationRubric: [
      "Recognizes O(N log K) complexity via Min-Heap or pair-wise divide-and-conquer",
      "Avoids sequential O(K*N) iterative merging",
    ],
  },
  {
    id: "q-14",
    title: "Design an End-to-End Encrypted Group Chat Architecture",
    category: "System Design",
    difficulty: "Hard",
    skills: ["Cryptography", "WebSockets", "Signal Protocol"],
    expectedTimeMinutes: 45,
    tags: ["Security", "WebSockets", "Real-Time"],
    description: "Design a WhatsApp-like encrypted group messaging system for up to 1,000 members per group, considering key distribution, message delivery receipts, and forward secrecy.",
    evaluationRubric: [
      "Explains Double Ratchet or Sender Keys for scaling group encryption",
      "Distinguishes server blind forwarding from client decryption",
      "Addresses offline message queueing and multi-device sync",
    ],
  },
  {
    id: "q-15",
    title: "Pushing Back on Unrealistic Leadership Timelines",
    category: "Behavioral",
    difficulty: "Medium",
    skills: ["Negotiation", "Estimation", "Executive Presence"],
    expectedTimeMinutes: 20,
    tags: ["Behavioral", "Management"],
    description: "Tell me about a time an executive demanded a feature in 2 weeks that realistically required 6 weeks. How did you handle the conversation?",
    evaluationRubric: [
      "Brings objective data and broken-down work estimates rather than subjective complaints",
      "Proposes an MVP tiering strategy (what can fit safely vs what moves to phase 2)",
      "Maintains professional alignment with organizational goals",
    ],
  },
  {
    id: "q-16",
    title: "Longest Substring Without Repeating Characters",
    category: "Coding",
    difficulty: "Medium",
    skills: ["Sliding Window", "Strings", "Hash Set"],
    expectedTimeMinutes: 20,
    tags: ["Sliding Window", "Two Pointers"],
    description: "Given a string s, find the length of the longest substring without repeating characters.",
    starterCode: {
      typescript: `function lengthOfLongestSubstring(s: string): number {
  // Your code here
  return 0;
}`,
      python: `def lengthOfLongestSubstring(s: str) -> int:
    # Your code here
    return 0`,
    },
    testCases: [
      { input: "abcabcbb", expectedOutput: "3", description: "'abc' has length 3" },
      { input: "bbbbb", expectedOutput: "1", description: "Single character repetition" },
      { input: "pwwkew", expectedOutput: "3", description: "'wke' has length 3" },
    ],
    evaluationRubric: [
      "Applies sliding window with left/right pointer index map",
      "Runs in strict O(N) time without quadratic slicing",
    ],
  },
  {
    id: "q-17",
    title: "Diagnosing Memory Leaks in Node.js Services",
    category: "System Design",
    difficulty: "Medium",
    skills: ["Node.js", "V8 Engine", "Profiling"],
    expectedTimeMinutes: 30,
    tags: ["Performance", "Debugging", "Node.js"],
    description: "A production Node.js microservice runs out of heap memory (OOM crash) every 48 hours. Walk through your step-by-step heap dump inspection and isolation process.",
    evaluationRubric: [
      "Mentions taking heap snapshots via v8 profiler or Chrome DevTools inspect",
      "Identifies common offenders: uncleaned event emitters, closure leaks, global cache arrays",
      "Explains synthetic load reproduction in staging environment",
    ],
  },
  {
    id: "q-18",
    title: "Valid Parentheses with Multiple Bracket Styles",
    category: "Coding",
    difficulty: "Easy",
    skills: ["Stack", "Strings"],
    expectedTimeMinutes: 15,
    tags: ["Stack", "Warmup"],
    description: "Given a string s containing '(', ')', '{', '}', '[' and ']', determine if the input string is valid. Brackets must close in the correct order and match open brackets.",
    starterCode: {
      typescript: `function isValid(s: string): boolean {
  // Your code here
  return true;
}`,
    },
    testCases: [
      { input: "()[]{}", expectedOutput: "true", description: "Direct paired matches" },
      { input: "(]", expectedOutput: "false", description: "Mismatched bracket closing" },
      { input: "([)]", expectedOutput: "false", description: "Interleaved invalid order" },
    ],
    evaluationRubric: [
      "Uses Stack data structure with lookup hash map for matching pairs",
      "Checks stack empty state at completion",
    ],
  },
  {
    id: "q-19",
    title: "Architecting an AI Agent Guardrail and Moderation Gateway",
    category: "System Design",
    difficulty: "Hard",
    skills: ["LLMs", "Latency Budgeting", "Safety"],
    expectedTimeMinutes: 45,
    tags: ["AI", "Security", "LLM"],
    description: "Design a low-latency proxy gateway (<50ms p95 overhead) that intercepts LLM streaming tokens, scans for prompt injection and PII leakage, and halts output dynamically if violated.",
    evaluationRubric: [
      "Implements streaming token chunk regex / embeddings classifier pipeline",
      "Balances safety buffer latency with streaming user experience (TTFT)",
      "Handles stateful multi-turn jailbreak attempts",
    ],
  },
  {
    id: "q-20",
    title: "Mentoring an Underperforming Teammate",
    category: "Behavioral",
    difficulty: "Medium",
    skills: ["Empathy", "Coaching", "Communication"],
    expectedTimeMinutes: 20,
    tags: ["Mentorship", "Culture"],
    description: "Tell me about a time you noticed an engineer on your team struggling with code quality or deliverables. How did you diagnose the issue and help them improve?",
    evaluationRubric: [
      "Begins with curiosity rather than accusation (discovering blockers/personal hurdles)",
      "Pairs actionable feedback with concrete pair-programming sessions",
      "Tracks quantifiable milestone improvements over 30-60 days",
    ],
  },
];
