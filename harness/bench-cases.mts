/**
 * The learners for harness/bench-deep.mts: hard problems, and people stuck on
 * them the way people really get stuck.
 *
 * Everything said here about what a piece of code does was run, not reasoned:
 * a tutor is marked wrong for a false statement, so the answer key cannot
 * have one.
 */

/** Someone with broken code, a theory about why, and a belief underneath that is the real trouble. */
export type Knot = {
  id: string; topic: string; problem: string;
  /** The learner's code, as it is on screen. */
  code: string;
  /** What pressing Run really shows. */
  runs: string;
  who: string;
  /** Their first line: the symptom, and the theory they have talked themselves into. */
  opens: string;
  /** What is actually wrong with the code. */
  bug: string;
  /** The wrong idea in their head that produced it. Fixing the code without this fixes nothing. */
  belief: string;
  /** The theory they will push. It is wrong, and following it wastes the session. */
  decoy: string;
  /** What has to happen in the conversation for it to click. */
  unlock: string;
  /** Whether words alone will not do it: this learner has to see the state. */
  needsPicture: boolean;
  /** Whether they will work things out in their head when asked. Many people will not: they want it shown. */
  inHead: boolean;
};

export const KNOTS: Knot[] = [
  {
    id: 'binary-search-hangs', topic: 'binary search',
    problem: 'Search a sorted list for a target. Return where it is, or -1.',
    code: `function search(nums, target) {
  let lo = 0, hi = nums.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (nums[mid] < target) lo = mid;
    else hi = mid;
  }
  return nums[lo] === target ? lo : -1;
}`,
    runs: 'nums [1, 3, 5, 7], target 1: gave 0, passed. nums [1, 3, 5, 7], target 7: did not finish, stopped after running too long.',
    who: 'Has done a bootcamp. Quick, a bit impatient, sure the bug is a one-character fix.',
    opens: 'My binary search just hangs on some inputs. I think the while condition is wrong. Should it be less than or equal?',
    bug: 'When lo and hi are next to each other, mid rounds down to lo, so `lo = mid` changes nothing and the loop never ends. It has to be `lo = mid + 1`.',
    belief: 'That mid always lands strictly between lo and hi, so setting lo to mid always makes the range smaller.',
    decoy: 'That the while condition should be `lo <= hi`. It is not the cause: with that change it hangs on even more inputs.',
    unlock: 'The learner works out mid themselves for lo = 2, hi = 3 (it is 2, the same as lo) and sees that `lo = mid` leaves everything where it was.',
    needsPicture: false,
    inHead: true,
  },
  {
    id: 'window-shrinks-once', topic: 'sliding window',
    problem: 'Longest substring without repeating characters. Return its length.',
    code: `function longest(s) {
  const inside = new Set();
  let left = 0, best = 0;
  for (let right = 0; right < s.length; right++) {
    if (inside.has(s[right])) {
      inside.delete(s[left]);
      left++;
    }
    inside.add(s[right]);
    best = Math.max(best, right - left + 1);
  }
  return best;
}`,
    runs: '"abcabcbb": gave 3, passed. "abba": gave 3, expected 2. "pwwkew": gave 4, expected 3.',
    who: 'Self-taught, careful, has watched a lot of videos. Tends to reach for a bigger tool when stuck.',
    opens: "This passes abcabcbb but gives 3 for abba when it should be 2. I think a Set just can't do this and I need a Map of positions instead?",
    bug: 'It shrinks the window by one character with `if`. It has to keep shrinking with `while` until the repeated character is actually gone.',
    belief: 'That dropping one character off the left always removes the repeat. That is only true when the repeat happens to be the leftmost character.',
    decoy: 'That a Set cannot solve this and a Map of positions is needed. A Map version exists, but the Set is not what is wrong here.',
    unlock: 'With "abba" laid out in front of them at the second b, the learner sees for themselves: the window is "ab", dropping the left character removes the a, and the b is still in there twice.',
    needsPicture: true,
    inHead: false,
  },
  {
    id: 'biggest-coin-first', topic: 'dynamic programming',
    problem: 'Coin change. Given coin values and an amount, return the fewest coins that make the amount, or -1.',
    code: `function coinChange(coins, amount) {
  coins.sort((a, b) => b - a);
  let count = 0;
  for (const coin of coins) {
    while (amount >= coin) {
      amount -= coin;
      count++;
    }
  }
  return amount === 0 ? count : -1;
}`,
    runs: 'coins [1, 2, 5], amount 11: gave 3, passed. coins [2], amount 3: gave -1, passed. coins [1, 3, 4], amount 6: gave 3, expected 2.',
    who: 'Works a till at weekends. Confident, because this is literally how they give change every day.',
    opens: "It passes the examples but fails one test. I bet it's the minus one case, when the amount can't be made.",
    bug: 'It always takes the biggest coin that fits. With coins 1, 3, 4 and amount 6 that gives 4 + 1 + 1, three coins, when 3 + 3 is two.',
    belief: 'That taking the biggest coin first is always best, because that is how real money works. (Real coin systems are designed so it does; arbitrary ones are not.)',
    decoy: 'That the trouble is in the -1 case. That case is handled correctly.',
    unlock: 'The learner sees a case where biggest-first loses (1, 3, 4 making 6) and says in their own words that an early grab can spoil what is left, so every coin has to be considered.',
    needsPicture: false,
    inHead: true,
  },
  {
    id: 'eight-empty-lists', topic: 'backtracking',
    problem: 'Return every subset of a list of distinct numbers.',
    code: `function subsets(nums) {
  const res = [];
  const path = [];
  function go(start) {
    res.push(path);
    for (let i = start; i < nums.length; i++) {
      path.push(nums[i]);
      go(i + 1);
      path.pop();
    }
  }
  go(0);
  return res;
}`,
    runs: 'nums [1, 2, 3]: gave [[], [], [], [], [], [], [], []], expected eight different subsets.',
    who: 'Came from spreadsheets. Thinks in values, not in boxes that things live in. Gets flustered by recursion and says so.',
    opens: "I get eight empty lists. I think the pop is deleting my answers. Should I take the pop out?",
    bug: '`res.push(path)` puts the same one list into res eight times. It needs a copy each time: `res.push([...path])`. By the end the pops have emptied that one list.',
    belief: 'That pushing path into res saves a snapshot of what it holds at that moment.',
    decoy: 'That the pop is the problem. Without it the result is eight copies of one long wrong list.',
    unlock: 'The learner realises there is only ever one path list, and res holds it eight times, so whatever happens to it later shows up in all eight.',
    needsPicture: true,
    inHead: false,
  },
  {
    id: 'islands-overflow', topic: 'graph search on a grid',
    problem: 'Count the islands in a grid of "1" (land) and "0" (water).',
    code: `function numIslands(grid) {
  let count = 0;
  function sink(r, c) {
    if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length) return;
    if (grid[r][c] !== '1') return;
    sink(r + 1, c);
    sink(r - 1, c);
    sink(r, c + 1);
    sink(r, c - 1);
    grid[r][c] = '0';
  }
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      if (grid[r][c] === '1') { count++; sink(r, c); }
    }
  }
  return count;
}`,
    runs: 'grid [["1"]]: gave 1, passed. grid [["1", "1"]]: crashed, Maximum call stack size exceeded.',
    who: 'Anxious, an interview in three days. Apologises a lot. Reads error messages as accusations.',
    opens: "I get maximum call stack size exceeded and I don't know why. Sorry. I think my bounds check is off somewhere?",
    bug: 'It marks the cell as sunk after visiting the neighbours. Two cells of land next to each other call each other forever, because neither is marked yet. The mark has to come before the four calls.',
    belief: 'That it does not matter where in the function the cell is marked, as long as it gets marked.',
    decoy: 'That the bounds check is wrong. It is correct.',
    unlock: 'The learner follows two land cells side by side and sees it: the first calls the second, the second calls the first, and the first is still land because its mark has not happened yet.',
    needsPicture: true,
    inHead: false,
  },
  {
    id: 'min-heap-for-largest', topic: 'heaps',
    problem: 'Find the k-th largest number in a list.',
    code: `function findKthLargest(nums, k) {
  const heap = new MinHeap();
  for (const n of nums) {
    heap.push(n);
    if (heap.size() > k) heap.pop();
  }
  return heap.peek();
}`,
    runs: 'All 3 tests passed. (This code is correct.)',
    who: 'Strong at maths, new to data structures. Argues, and only gives way to an argument, not to authority.',
    opens: "This is backwards, right? We want the k-th LARGEST, so it should be a max heap. I changed it to a max heap and it gives the wrong answer, and I can't see why.",
    bug: 'Nothing is wrong with the code. With a max heap, pop throws away the biggest each time, so what is left is the k smallest.',
    belief: 'That the heap is where the answer is fetched from, so it should be the kind that hands you big numbers. They have not seen that the heap is a club of the k biggest so far, and the one to throw out is the smallest member.',
    decoy: 'That it should be a max heap. It should not.',
    unlock: 'The learner says in their own words that the heap holds the k biggest seen so far, that the top of a min heap is the weakest of those, and that the weakest of the top k is exactly the k-th largest.',
    needsPicture: true,
    inHead: true,
  },
  {
    id: 'seen-twice-is-a-cycle', topic: 'cycle detection in a graph',
    problem: 'Course schedule. There are n courses and pairs [course, before] meaning `before` must be taken first. Return whether all courses can be finished.',
    code: `function canFinish(n, prereqs) {
  const next = Array.from({ length: n }, () => []);
  for (const [course, before] of prereqs) next[before].push(course);
  const seen = new Set();
  function hasCycle(c) {
    if (seen.has(c)) return true;
    seen.add(c);
    for (const d of next[c]) if (hasCycle(d)) return true;
    return false;
  }
  for (let c = 0; c < n; c++) {
    if (hasCycle(c)) return false;
  }
  return true;
}`,
    runs: 'n = 2, pairs [[1, 0]]: gave false, expected true. n = 2, pairs [[1, 0], [0, 1]]: gave false, passed.',
    who: 'A second-year CS student who knows the vocabulary and uses it a little too freely. Confident about graphs.',
    opens: "It says false for the simplest chain, zero before one. I think I built the graph backwards. Should it be next[course].push(before)?",
    bug: 'One `seen` set cannot tell "I am in the middle of this course right now" from "I finished this course earlier and it was fine". Meeting a finished course again is not a cycle. It needs two marks: in progress, and done.',
    belief: 'That seeing a course a second time means there is a cycle.',
    decoy: 'That the edges point the wrong way. Flipping them gives the same wrong answer.',
    unlock: 'The learner sees that course 1 was fully finished during the walk from course 0, with no problem, and that meeting it again from the outer loop is not a loop at all: a cycle is only meeting something you are still in the middle of.',
    needsPicture: true,
    inHead: true,
  },
  {
    id: 'answer-in-the-last-box', topic: 'dynamic programming',
    problem: 'Longest increasing subsequence. Return its length.',
    code: `function lengthOfLIS(nums) {
  const dp = new Array(nums.length).fill(1);
  for (let i = 1; i < nums.length; i++) {
    for (let j = 0; j < i; j++) {
      if (nums[j] < nums[i]) dp[i] = Math.max(dp[i], dp[j] + 1);
    }
  }
  return dp[nums.length - 1];
}`,
    runs: 'nums [10, 9, 2, 5, 3, 7, 101, 18]: gave 4, passed. nums [1, 2, 3, 0]: gave 1, expected 3.',
    who: 'Has drilled a dozen DP problems from a list. Recognises shapes, and trusts the shape over the meaning.',
    opens: "Passes the big example, fails on 1, 2, 3, 0. I think my comparison in the inner loop is wrong. Maybe it should be less than or equal?",
    bug: 'dp[i] is the longest increasing run that ENDS at position i, so the answer is the largest value anywhere in dp, not the last one. For [1, 2, 3, 0] dp is [1, 2, 3, 1].',
    belief: 'That dp[i] is the best answer for the first i numbers, so the last box holds the final answer, as it does in problems like climbing stairs.',
    decoy: 'That the comparison should be `<=`. That would allow equal numbers, which is a different problem.',
    unlock: 'With the boxes for [1, 2, 3, 0] laid out in front of them (1, 2, 3, 1), the learner says in their own words that each box only speaks for runs ending exactly there, and sees the answer is the biggest box, not the last.',
    needsPicture: true,
    inHead: false,
  },
];

/** Someone who has never seen the idea, to be taken all the way to solving it alone. */
export type Climb = {
  id: string; topic: string; problem: string;
  /** The walkthrough's finished code, as it is on screen. */
  code: string;
  runs: string;
  who: string;
  knows: string;
  opens: string;
  /** In order. Each is something the learner can do or say, not something they were told. */
  rungs: string[];
  /** Asked a week later, alone. */
  hero: string;
  /** What a learner who really got there would say. */
  heroKey: string;
  /** Whether they will work things out in their head when asked. */
  inHead: boolean;
};

export const CLIMBS: Climb[] = [
  {
    id: 'coin-change', topic: 'dynamic programming',
    problem: 'Coin change. Given coin values and an amount, return the fewest coins that make the amount, or -1. Example: coins [1, 3, 4], amount 6 gives 2 (3 + 3).',
    code: `function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity);
  dp[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const coin of coins) {
      if (coin <= a) dp[a] = Math.min(dp[a], dp[a - coin] + 1);
    }
  }
  return dp[amount] === Infinity ? -1 : dp[amount];
}`,
    runs: 'All 3 tests passed.',
    who: 'Six months into learning to code. Got Two Sum by memorising it. Has heard "dynamic programming" said like a threat.',
    knows: 'Loops, lists, if statements, functions. Not recursion, not what dp means, not big-O.',
    opens: "I don't understand any of this. What even is dp?",
    rungs: [
      'Can say what the problem asks using coins 1, 3, 4 and amount 6, and why grabbing the biggest coin first (4, 1, 1) is not the best.',
      'Sees the last-coin idea: the best way to make 6 ends with some coin, so it is one more than the best way to make 6 minus that coin.',
      'Can say what one box holds: dp[a] is the fewest coins that make amount a.',
      'With the boxes for coins 1, 3, 4 laid out up to amount 6 (0, 1, 2, 1, 1, 2, 2), can say where any one box came from: which earlier box, plus one.',
      'Can explain why the boxes start at Infinity, why dp[0] is 0, and when the answer is -1.',
      'Can say why it is quick enough: every amount tries every coin once, and no amount is ever worked out twice.',
    ],
    hero: 'New coins: 2 and 5. The amount is 7. Talk me through the boxes and tell me the answer.',
    heroKey: 'Boxes for amounts 0 to 7 are 0, impossible, 1, impossible, 2, 1, 3, 2. The answer is 2 (5 + 2). They should build each box from earlier boxes, and say amounts 1 and 3 cannot be made.',
    inHead: false,
  },
  {
    id: 'permutations', topic: 'backtracking',
    problem: 'Return every ordering of a list of distinct numbers. Example: [1, 2, 3] gives six orderings.',
    code: `function permute(nums) {
  const res = [];
  const path = [];
  const used = new Array(nums.length).fill(false);
  function go() {
    if (path.length === nums.length) { res.push([...path]); return; }
    for (let i = 0; i < nums.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      path.push(nums[i]);
      go();
      path.pop();
      used[i] = false;
    }
  }
  go();
  return res;
}`,
    runs: 'All 3 tests passed.',
    who: 'Comfortable with loops. Recursion makes them feel physically lost: "I can\'t hold it in my head". Visual. Gives up quietly rather than loudly.',
    knows: 'Loops, lists, functions calling other functions. Has seen factorial done with recursion and did not really get it.',
    opens: 'A function that calls itself inside a loop. I read it five times and I lose track every time.',
    rungs: [
      'Can list the orderings of 1, 2, 3 by hand as a tree of choices: pick the first, then the second from what is left, then the last.',
      'Can say what path and used are at a given moment: path is the choices made so far, used is what is already taken.',
      'Sees that one call to go makes one choice and hands the rest on, so they only ever have to think about one level.',
      'Can explain why it undoes the choice (pop, and used back to false): to try the next option from the same spot.',
      'Can explain why it saves a copy of path, not path itself.',
      'Can say how many results there are for n numbers and why (n choices, then n minus 1, and so on).',
    ],
    hero: 'Change it so it gives every way to pick 2 of [1, 2, 3] in order, like 1 then 3. What do you change, and how many are there?',
    heroKey: 'Change the stopping check to path.length === 2. There are 6: three choices for the first, two for the second. Nothing else needs to change.',
    inHead: false,
  },
  {
    id: 'koko', topic: 'binary search on the answer',
    problem: "Koko eats bananas. There are piles of bananas and h hours. At speed k she eats k bananas an hour from one pile; a pile smaller than k still takes the whole hour. Return the slowest speed that finishes in h hours. Example: piles [3, 6, 7, 11], h = 8 gives 4.",
    code: `function minEatingSpeed(piles, h) {
  let lo = 1, hi = Math.max(...piles);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    let hours = 0;
    for (const p of piles) hours += Math.ceil(p / mid);
    if (hours <= h) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}`,
    runs: 'All 3 tests passed.',
    who: 'Knows binary search as "find a number in a sorted list" and nothing else. Literal-minded. Asks "but where is the sorted list?" and means it.',
    knows: 'Loops, lists, ordinary binary search on a sorted list, rounding up.',
    opens: "Why is this a binary search? The piles aren't even sorted.",
    rungs: [
      'Can work out by hand how many hours a given speed takes on piles 3, 6, 7, 11 (speed 4 takes 1 + 2 + 2 + 3 = 8) and say what is being asked for.',
      'Sees that speeds line up as no, no, no, yes, yes, yes: if a speed is fast enough, every faster one is too.',
      'Can say that the search is over speeds, not piles: guess a middle speed and test it.',
      'Can explain why a working speed sets hi = mid (it might be the answer) and a failing one sets lo = mid + 1.',
      'Can say why lo starts at 1 and hi at the biggest pile, and why lo is the answer when the loop stops.',
      'Can say what it costs: one pass over the piles for each guess, and about log of the biggest pile guesses.',
    ],
    hero: 'A different problem. Packages on a belt must be shipped in order within D days, and you want the smallest ship that can do it. What are you searching over, what is the yes or no test, and where do lo and hi start?',
    heroKey: 'Search over ship capacity. The test: load packages in order, start a new day when the next will not fit, and check the days needed are at most D. lo is the heaviest single package, hi is the total weight. Bigger ships always work if a smaller one does.',
    inHead: true,
  },
];
