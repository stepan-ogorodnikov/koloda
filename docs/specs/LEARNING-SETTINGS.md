# Learning Settings

Covers learning settings: defaults, daily limits, the learning-day boundary, and learn-ahead.
Does not cover lesson session flow, grading, or amount selection beyond how settings shape them.
Those behaviors are covered by the lessons spec.
Does not cover algorithm or template editing, or interface settings.

## What are Learning Settings

Learning settings are the user's global study preferences.
They decide which algorithm and template are suggested as defaults.
They set how many cards of each type count toward a day's work.
They set when the study day rolls over.
They set how far ahead a lesson may requeue a card after grading.

They are edited on the learning settings screen and take effect for later study.

## Core Model

- **Defaults** — the algorithm and template offered when creating a deck
- **Daily limits** — caps for New, Learn, Review, and Total for the current learning day
- **Counts toward total** — whether a per-type limit contributes to Total
- **Day starts at** — local wall-clock time that begins a new learning day
- **Learn-ahead limit** — how far into the future a graded card may still re-enter the same lesson

Relationships:

- Daily limits and today's review totals shape lesson init defaults.
- Day starts at defines the time window used for today's review totals.
- Learn-ahead is applied while studying; see the lessons spec.
- Defaults do not rewrite existing decks or cards.

## Defaults

The user chooses a default algorithm and a default template.

When adding a deck, the algorithm and template pickers fall back to these defaults if no other value is chosen.
Changing the defaults does not change decks or cards that already exist.

The default template cannot be deleted while it remains the default.
The default algorithm cannot be deleted while it remains the default.

On first setup, defaults are pointed at the seeded algorithm and template.

## Daily Limits

There is a Total limit and a limit for each of New, Learn, and Review.

Each of New, Learn, and Review has:

- a numeric value — the per-type cap for the learning day
- a **counts toward total** switch

Total has only a numeric value.

A limit value of zero means no cap for that limit.
The UI shows that as infinity where limits are displayed.

When Total is greater than zero, any per-type limit that counts toward Total must not exceed Total.
Saving with such a value is rejected and the previous settings are kept.
A per-type limit that does not count toward Total may be larger than Total.

Limits do not hard-block studying.
They shape lesson init defaults.
In a lesson, the user can still raise amounts up to what is available; see the lessons spec.

## Learning Day

**Day starts at** is a local time in hours and minutes.

The current learning day is the half-open window from that boundary up to the same time tomorrow.
If the current clock time is before today's boundary, the user is still in the previous learning day.

Today's review totals count non-ignored reviews created inside that window.
Reviews are bucketed by the state recorded on the review:

- **New** — new
- **Learn** — learning or relearning
- **Review** — review

The Total shown for today is the sum of New, Learn, and Review that have **counts toward total** enabled.
Types that do not count are still shown in their own rows, but they do not add to Total.

Changing Day starts at immediately changes which reviews fall into "today".
It does not rewrite review history.

## Learn Ahead

Learn-ahead is an hours-and-minutes duration from now.
Hours may be from 0 through 48.
Minutes may be from 0 through 59.

After a card is graded in a lesson, it may be appended back into that lesson when its new due time falls before now plus this duration.
Session details are covered by the lessons spec.

Setting both hours and minutes to zero means only cards whose new due time is already in the past can re-enter.
That effectively turns learn-ahead off for cards scheduled into the future.

## Editing and Saving

The learning settings form lets the user change defaults, limits, learn-ahead, and Day starts at.

Save persists the whole settings payload.
On success, the form resets to the saved values and the default algorithm and template used elsewhere update.

Discard restores the last saved values without writing.

Invalid input is rejected on save.
The previous saved settings remain unchanged.
Validation errors are shown on the form — for example when a counted per-type limit exceeds Total.

## Edge Cases

- A daily limit of zero is no cap, not a hard zero
- Types that do not count toward Total leave Total room unused when lesson defaults are computed
- Today's Total ignores reviews of types that do not count toward Total
- Ignored reviews do not contribute to today's totals
- Changing defaults never rewrites existing decks or cards
- Changing Day starts at can move reviews into or out of "today" without deleting them
- Failed validation does not partially apply settings
- Learn-ahead of zero duration does not requeue cards that become due only in the future
