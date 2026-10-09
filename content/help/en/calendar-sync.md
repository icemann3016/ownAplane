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

- They **block the time** here like your own blocks. Pilots only see "unavailable", never names
  or details. In your calendar they show "From" and the connection's name.
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
blocks here (times only, no names or notes), without that system's own bookings. Subscribe to it
in the other system. **Reset link** if it was shared by mistake; the old one stops working.

## JSON format (for developers)

A JSON link must return the system's bookings for the aircraft, for example:

```
{ "busy": [ { "id": "42", "start": "2026-10-20T08:00:00Z", "end": "2026-10-20T11:00:00Z" } ] }
```

`id` is the booking's id in that system, `start` and `end` are ISO 8601 times with a time zone.
The API for pushing bookings is described at `/api/v1/openapi.json` and in the developer guide.
