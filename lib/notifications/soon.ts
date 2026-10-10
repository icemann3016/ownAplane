import "server-only";

import { after } from "next/server";

import { deliverWebhooks } from "@/lib/calendar-sync/webhooks";
import { reportError } from "@/lib/monitoring";
import { deliverNotificationEmails } from "./index";

/**
 * After the response is sent, email any new notifications and send webhooks to connected
 * systems (SYN-6); the scheduled jobs catch up anything missed.
 */
export function sendNotificationsSoon() {
  after(async () => {
    await deliverNotificationEmails().catch((e) =>
      reportError(e, { where: "notification emails" }),
    );
    await deliverWebhooks().catch((e) => reportError(e, { where: "webhooks" }));
  });
}
