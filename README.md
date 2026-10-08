# Which language model can actually teach?

A three-stage benchmark for a voice coding tutor, and everything needed to run it again.

**Read the paper:** [kobby-adjei.github.io/ai-tutor-benchmark](https://kobby-adjei.github.io/ai-tutor-benchmark/) · [PDF](paper/which-model-can-teach.pdf)

By Kwabena Adu Adjei, October 2026. Built while choosing the model behind Blink, the voice tutor in [syncs](https://trysyncs.com).

## The question

Model leaderboards say which model answers correctly. I wanted to know something else: put in front of a learner who is stuck, which model finds *where* they are stuck and gets them out? That is what a good human tutor does, and it is the part of AI in education that is hardest to measure.

## What was found

1. **Fast is not the same as good at teaching.** The quickest model to act ranked 9th of 12 at teaching.
2. **The ranking depends on how the learner is modelled.** With scripted learners one model ranked 5th. With live learners that react, it ranked 1st.
3. **Short turns separated the winner.** It kept three turns in four under forty words. Every other model ran past forty in most of its turns and kept hearing "I dropped off after…".
4. **Every model reaches for the fix.** Most found the bug (81–100%). Far fewer got the learner to see it for themselves (13–69%).
5. **Zero to hero did not happen.** The best model got a beginner 1.5 rungs up a ladder of 6 in twelve turns.

Stage 3, eight learners stuck on hard problems, six turns each:

| Model | Untangled | Found the belief | Took the bait | Did it for them | Median words a turn |
|---|---|---|---|---|---|
| Gemini 3.5 Flash Lite | 6 / 8 | 88% | 0% | 44% | 26 |
| GPT-6 Luna Fast | 4 / 8 | 88% | 13% | 56% | 42 |
| GLM 5.3 Flash | 4 / 8 | 75% | 25% | 75% | 70 |
| Claude Haiku 5.5 | 3 / 8 | 69% | 69% | 63% | 63 |
| Claude Sonnet 5.5 | 2 / 8 | 75% | 19% | 38% | 52 |
| Claude Haiku 4.5 | 1 / 8 | 50% | 31% | 81% | 79 |
| gpt-oss-120b (6 knots) | 1 / 6 | 50% | 67% | 83% | 45 |

The paper has the full method, all three stages, and the limits.

## The three stages

| Stage | What it asks | Models | Script |
|---|---|---|---|
| 1. Speed and hands | How soon does it act, and does it call the right tool with arguments that work? | 25 | `harness/bench-brains.mts` |
| 2. Scripted learners | Nine learners who do not behave (still lost, confidently wrong, in a hurry, bored, flat, joking, discouraged). Fixed lines, so every model meets the same person. | 12 | `harness/bench-teaching.mts` |
| 3. Live learners | A third model plays the learner from a hidden card: broken code, a wrong theory, and a false belief underneath. It only "clicks" if the tutor finds that belief. Plus three beginners and a six-rung ladder. | 7 | `harness/bench-deep.mts` |

Stages 2 and 3 are scored by two judges from different makers, blind to which model is which, reading every tutor on the same learner side by side.

The simulated learner is told to behave like a person, not an assistant. It takes in only the start of a long turn, never pretends to follow, never asks for a picture, tires of being quizzed, and some learners will not work things out in their head. The cards are in [`harness/bench-cases.mts`](harness/bench-cases.mts). Every claim in them about what a piece of code does was produced by running that code.

## What is in this repository

```
index.html                 the paper (also served as the site)
paper/                     the paper as a PDF
data/                      raw results: every conversation and every verdict
  stage1-speed-and-hands.json
  stage2-scripted-learners.json
  stage3-live-learners.json
harness/                   the benchmark
  bench-brains.mts         stage 1
  bench-teaching.mts       stage 2
  bench-deep.mts           stage 3
  bench-cases.mts          the learners for stage 3
  bench-shared.mts         the problem on screen, and one timed request
  tutor/
    instructions.ts        the tutor's instructions, as they were when the study ran
    tools.json             the tutor's eleven tools
```

## Run it

You need Node 22 or later and a [Vercel AI Gateway](https://vercel.com/ai-gateway) key. Every model is reached through the gateway.

```bash
npm install
cp .env.example .env        # then put your key in it
npm run stage1              # about $2
npm run stage2              # about $4
npm run stage3              # about $14, most of it the simulated learner
```

Results are written to `out/`. Each script takes model ids to run a subset, and stage 3 can be narrowed and capped:

```bash
npx tsx --env-file=.env harness/bench-brains.mts out/s1.json openai/gpt-4.1-nano
npx tsx --env-file=.env harness/bench-deep.mts out/s3.json --knots=binary-search-hangs --climbs= --cap=2
```

Stage 3 saves as it goes. Run it again with the same file and it carries on where it stopped.

**Give it a key of its own.** Set `BENCH_GATEWAY_KEY` to a key with its own budget and the scripts use that instead. I ran the first version of this on a product's key, used up its monthly budget, and took a live feature down.

Expect your numbers to differ somewhat from mine. Models are not deterministic, the simulated learner is a model too, and providers update models in place.

## Benchmark your own tutor

The tutor under test is two files in `harness/tutor/`: its instructions and its tools. Replace them with yours and the same learners and judges will test it. The learner cards do not depend on the tutor.

## Limits

These are stated in full in the paper. In short:

- **The learners and the judges are models.** Nothing here measures whether a human learned. A small human check on a blind sample of the transcripts is the obvious next step.
- **The forty-word rule shapes the headline.** The live learner takes in about forty words of a turn. That is a design choice, and the "short turns win" finding follows partly from it. It was not varied.
- **One conversation per learner in stage 3.** One learner is worth 12.5 points. The gaps are suggestive, not established.
- **No human baseline.** A skilled human tutor was not put in front of the same simulated learner, so the ladder results may reflect a harsh test as much as weak tutors.
- **Narrow coverage.** A handful of problems, JavaScript, English, one set of tutor instructions.

## Licence

Code is under the MIT licence. The paper, the learner cards and the data are under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): use them, and say where they came from.

To cite:

> Adjei, K. A. (2026). *Which language model can actually teach? A three-stage benchmark for a voice coding tutor.* https://github.com/Kobby-Adjei/ai-tutor-benchmark
