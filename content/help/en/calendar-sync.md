# Calendar sync with other booking systems

If your aircraft is also booked somewhere else (a club or flight-school system, your Google
Calendar, another platform), connect that system under **My aircraft → your aircraft → Calendar
sync**. ownAplane then never accepts a booking for time that is taken there, and the other system
can see ours.

## Connect a system

Give the connection a name and choose how the other system's bookings reach us:

- **It sends them to us (API):** the best option for a system that can call a web address,
  for example your own or your club's software. Its bookings arrive the moment they are made.
  You get an **API key**, shown only once: give it to the system's developers, with the link to
  the instructions on the connection.
- **iCal link:** Google Calendar, Outlook and most booking systems have a private iCal address
  (in Google Calendar: Settings → your calendar → "Secret address in iCal format"). Paste it
  here; `webcal://` links work too.
- **JSON link:** for a custom system that can publish a simple list of its bookings (format
  below).
- **It only reads ours:** nothing comes back; the other system just subscribes to our link.

You can connect up to 10 systems per aircraft.

## What happens with their bookings

- They **block the time** here like your own blocks. Pilots only see "unavailable" (or
  "maintenance", if you take the type), never names or details. In your calendar they show
  "From" and the connection's name, and their title if you take it.
- iCal and JSON links are read **every 15 minutes**, and again **right before** a booking is
  requested or accepted, so a time booked there a minute ago can't be booked here.
- If a link can't be read, the connection says why, and the busy times read before stay in
  place.
- **Disconnect** a system to remove its busy times; that time can then be booked again.

## Double bookings

If the other system books a time that is already booked or requested here, nothing is silently
dropped: the connection shows a **double booking** warning and you get a notification and an
email. Cancel one of the two bookings, here or in the other system; the warning disappears by
itself. While another system has the time, you can't accept a request for it.

## Our iCal link for the other system

Each connection has its own private **iCal link** with the aircraft's bookings, requests and
blocks here (times only, unless you choose more below), without that system's own bookings.
Subscribe to it in the other system. **Reset link** if it was shared by mistake; the old one stops
working.

## Choose what is shared

By default, only **times** go both ways: when the aircraft is busy and whether it's a booking.
Open **Data exchanged with this system** on a connection to choose more, then **Save**. The other
system gets the change with its next read.

**Send to this system** (our iCal link and the busy-times API):

- **Type:** own use, maintenance or unavailable, instead of just "unavailable".
- **Booking status:** requested, accepted or in progress. Requests are marked tentative.
- **Route:** the departure and arrival airfields of each booking.
- **Pilot's name:** personal data. Share it only with a system you trust, and tell your pilots
  (for example in your rental terms). Pilots' email addresses and phone numbers are never sent.
- **Booking reference:** the ownAplane booking number and a link that opens for you.
- **Your notes on blocked time:** what you wrote when you blocked the time.
- **Aircraft registration:** helps when one system handles several aircraft.

Titles from your other connected systems are never passed on.

**Take from this system** (what it sends us and its link):

- **Title:** shown in your calendar, only to you.
- **Type:** its maintenance is shown as maintenance here (pilots see that too).
- **Status:** tentative bookings don't block the aircraft; only confirmed ones do.
- **Aircraft registration:** bookings it sends for another aircraft are refused.

## Tell the other system about changes (webhook)

If the other system can receive calls from the internet, open **Tell this system about changes
(webhook)** on its connection, enter the address its developers give you and **Save address**.
From then on, every booking, request or block of the aircraft that is made, changed or cancelled
here is sent there at once, with the data you chose to send. Give the **signing secret** to the
developers: it proves the calls come from ownAplane. **Send a test** checks that it works; the
connection shows when the last call went through or why it failed (failed calls are tried again
for a day). The other system can also set this up itself with its API key.

## JSON format (for developers)

A JSON link must return the system's bookings for the aircraft, for example:

```
{ "busy": [ { "id": "42", "start": "2026-10-20T08:00:00Z", "end": "2026-10-20T11:00:00Z" } ] }
```

`id` is the booking's id in that system, `start` and `end` are ISO 8601 times with a time zone.
Optional per booking: `title`, `type` (`booking` or `maintenance`), `status` (`confirmed`,
`tentative` or `cancelled`) and `registration`; they are used only as you chose above.
The API for pushing bookings is described at `/api/v1/openapi.json` and in the developer guide.
