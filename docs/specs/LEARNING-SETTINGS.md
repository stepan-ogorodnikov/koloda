# Learning Settings

## Scope

Covers learning settings: defaults, daily limits, the learning-day boundary, and learn-ahead.
Does not cover lesson session flow, grading, or amount selection beyond how settings shape them.
Does not cover where today's totals are shown on the lessons screen.
Those behaviors are LESSONS.md.
Does not cover algorithm or template editing, or interface settings.

## What it is

Learning settings are the user's global study preferences.
They decide which algorithm and template are suggested as defaults.
They set how many cards of each type count toward a day's work.
They set when the study day rolls over.
They set how far ahead a lesson may requeue a card after grading.

They are edited on the learning settings screen and take effect for later study.

## Core model

- **Defaults** — the algorithm and template offered when creating a deck
- **Daily limits** — caps for New, Learn, Review, and Total for the current learning day.
  Each cap is unlimited or a non-negative number.
- **Counts toward total** — whether a per-type limit contributes to Total
- **Day starts at** — local wall-clock time that begins a new learning day
- **Learn-ahead limit** — how far into the future a graded card may still re-enter the same lesson

Relationships:

- Daily limits and today's review totals shape lesson init defaults; see LESSONS.md (§Default Amounts).
- Those same figures are shown on the lessons screen; see LESSONS.md (§Today's Progress).
- Day starts at defines the time window used for today's review totals.
- Learn-ahead is applied while studying; see LESSONS.md (§Learn Ahead).
- Defaults do not rewrite existing decks or cards.

## Defaults

The user chooses a default algorithm and a default template.

When adding a deck, the algorithm and template pickers fall back to these defaults if no other value is chosen.
Changing the defaults does not change decks or cards that already exist.

The default template cannot be deleted while it remains the default.
The default algorithm cannot be deleted while it remains the default.

On first setup, defaults are pointed at the seeded algorithm and template.

## Daily Limits

There is a Total cap and a cap for each of New, Learn, and Review.

Each cap is either unlimited or a non-negative number.
The user sets unlimited with an Unlimited control next to that cap.

Each of New, Learn, and Review also has a **counts toward total** switch.
That switch still applies when the type is unlimited.

Total has only a cap.

Zero is a hard cap for that limit.
That limit has no remaining room.
Any cards of that type already studied today are over that type's limit.
A Total of zero is a hard cap for Total.

Unlimited Total does not cap counted types.

Where a cap is shown, unlimited appears as infinity.

When Total is a number, any per-type number that counts toward Total must not exceed Total.
Saving with such a value is rejected and the previous settings are kept.
When Total is zero, a counted per-type number must be zero.
A per-type cap that does not count toward Total may be larger than Total.
Unlimited New, Learn, or Review is allowed when Total is a number.
Total still clamps counted remaining room when init defaults are computed; see LESSONS.md (§Default Amounts).

Limits do not hard-block studying.
They shape lesson init defaults.
In a lesson, the user can still raise amounts up to what is available; see LESSONS.md (§Init).
Types that do not count toward Total leave Total room unused when those defaults are computed.

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
