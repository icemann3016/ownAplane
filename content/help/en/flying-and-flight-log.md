# Flying: check-out, flight log and check-in

Every rental has a **flight log**: a record between you and the owner. It is **not** the
aircraft's journey or technical log, and not your pilot logbook.

## Weather

From **30 hours before departure**, the booking and the flight log show the forecast (TAF) for
the booked time at every airfield of the flight; from **3 hours before**, also the latest
observation (METAR). Airfields without their own reports use the nearest reporting station
within 50 km.

When visibility under 5 km or a ceiling below 1 500 ft is reported or forecast, you see a
warning, plus whether the aircraft is approved for IFR and (only for you, the pilot) whether you
hold a valid instrument rating. These are **warnings, never a block**: the pilot in command
decides, after a full official weather briefing. Data: aviationweather.gov.

## Check-out

From **2 hours before** the booked time, your booking has a **Check out** button. It opens the
flight log and puts the booking **In progress**. Enter what you find before the first flight:
Hobbs and tach, fuel on board, oil level, and optionally a photo of the meters.

## Legs

Add one **leg** per flight (**Add leg**), for example LBSF → LBPD → LBSF as two legs:

- **From / To** airfields and the **date**.
- The times **in the order they happen**, all in UTC: **engine start, block off, take-off,
  landing, block on, engine stop**. Take-off and landing are optional. Times past midnight (UTC)
  are handled.
- **Landings**, **Hobbs** and **tach** at start and end, **fuel** and **oil** before and after.
  Pick **L** or **US gal** for fuel in each form; the app converts it.

The app checks every leg:

- **Engine start ≤ block off < take-off < landing < block on ≤ engine stop** (block off may be
  the same minute as engine start, and engine stop the same minute as block on), and a leg can't
  be longer than 12 hours.
- **Hobbs and tach** end must be higher than start.
- **Fuel after** must be lower than fuel before, and **oil after** can't be higher than oil
  before. "After" is what you read on arrival, **before** refuelling: fuel and oil you add
  between legs or after the last one go under **Fuel and oil added**.

You can edit or delete legs until you check in.

## Fuel and oil added

**Add fuel or oil** for every refuelling or oil top-up: airfield, quantity, fuel type or oil
grade, **price paid** (in the booking's currency), **who paid** (you, or the owner's account) and
the **receipt** (optional; the owner can open it). How it counts in the amount due:

- **Wet rate:** fuel you paid for is taken off.
- **Dry rate:** fuel from the owner's account is added.
- **Oil** is part of both rates, so oil you paid for is always taken off.
- Entries without a price don't count, and the page says so.

If fuel or oil on board **went up between two legs** (or between check-out and the first leg) by
more than you recorded as added at that airfield, or something was added at an airfield the
aircraft never visited, the log shows a **Check the fuel and oil readings** note to you and the
owner. Small gauge differences (2 L of fuel, 0.3 L of oil) are ignored.

## Remarks and PIREPs

Under **Remarks and PIREPs**, note anything the owner or the next pilot should know that isn't a
defect: about the **aircraft** ("COM2 scratchy"), the **weather** or an **airfield**.

## Report a defect

Something that may affect airworthiness? Use **Report a defect** (on the booking or the flight
log): how serious it is (**minor**, **major**, or **unsafe**: shouldn't fly), what's wrong, and
an optional photo. The owner is emailed straight away.

## Checks on your entries

The log checks your entries as you go and shows what doesn't add up, to you and the owner. These
are warnings, never blocks: correct a typo, or leave it and the owner decides when confirming.

- **Wrong fuel:** fuel that doesn't suit the aircraft. Jet A-1 in a petrol engine (or the other
  way round) shows a red warning: if it's true, **don't fly** and report an unsafe defect. A
  lower grade than the aircraft's (for example UL91 or MOGAS instead of AVGAS 100LL) is only fine
  if the engine is approved for it.
- **Meters:** a Hobbs or tach that moved more than the engine ran, or a Hobbs that moved less
  than the time between take-off and landing.
- **Fuel burn:** much more or much less than the aircraft's usual litres per hour. Often a mix-up
  between litres and US gallons; otherwise it could be a leak.
- **Times:** a leg that starts before or ends after your booked time (15 minutes either way are
  fine), or runs into the aircraft's next booking.
- **Check-out readings:** a Hobbs or tach lower than at the end of the last rental. Meters don't
  run backwards, so it's a typo.

## Check-in

When you're back, **Check in and send to the owner**. The summary shows the **flown time** (on
the aircraft's time basis: Hobbs, tach or block time), the **billed hours** (at least the owner's
minimum per day) × rate, the **fuel and oil** adjustment and the **amount due**. After check-in
you can't change the log, unless the owner asks for a **correction**: then it opens again with
their note, and you send it once more.

When the owner **confirms**, the booking is **Completed**. Pay the owner directly.

## Export your flights

**Bookings → Export my flights (CSV)** downloads all legs from your sent and confirmed flight
logs in logbook order (date, departure and off-block time, arrival and on-block time in UTC,
type, registration, block time, landings), to help you fill in your pilot logbook.
