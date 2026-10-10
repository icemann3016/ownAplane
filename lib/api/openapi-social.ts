import { errors, jsonBody, ok, output, pathId, ref, signedIn } from "./openapi-helpers";
import {
  conversation,
  conversationSummary,
  favourite,
  messageBody,
  notification,
  savedSearch,
  savedSearchBody,
  savedSearchPatch,
  startConversationBody,
} from "./social";

// OpenAPI paths of messages, notifications, favourites and saved searches (lib/api/social.ts).

export function socialSchemas() {
  return {
    ConversationSummary: output(conversationSummary),
    Conversation: output(conversation),
    Notification: output(notification),
    Favourite: output(favourite),
    SavedSearch: output(savedSearch),
  };
}

const created = (schema: string) => ({
  201: {
    description: "Created",
    content: {
      "application/json": { schema: { type: "object", properties: { data: ref(schema) } } },
    },
  },
});

export function socialPaths() {
  return {
    "/api/v1/conversations": {
      get: {
        tags: ["messages"],
        summary: "Your conversations, newest first",
        security: signedIn,
        responses: { ...ok(ref("ConversationSummary"), true), ...errors(401) },
      },
      post: {
        tags: ["messages"],
        summary: "Open (or find) the conversation about a booking or listing, with a first message",
        security: signedIn,
        requestBody: jsonBody(startConversationBody),
        responses: { ...created("Conversation"), ...errors(400, 401, 404, 429) },
      },
    },
    "/api/v1/conversations/{id}": {
      get: {
        tags: ["messages"],
        summary: "The messages, oldest first; marks them read",
        security: signedIn,
        parameters: [pathId("id", "Conversation id (uuid)")],
        responses: { ...ok(ref("Conversation")), ...errors(401, 404) },
      },
    },
    "/api/v1/conversations/{id}/messages": {
      post: {
        tags: ["messages"],
        summary: "Send a message (429 after too many in a short time)",
        security: signedIn,
        parameters: [pathId("id", "Conversation id (uuid)")],
        requestBody: jsonBody(messageBody),
        responses: { ...created("Conversation"), ...errors(400, 401, 404, 429) },
      },
    },
    "/api/v1/notifications": {
      get: {
        tags: ["notifications"],
        summary:
          "The latest 50 notifications with a sentence in the user's language; `unread` count",
        security: signedIn,
        responses: { ...ok(ref("Notification"), true), ...errors(401) },
      },
    },
    "/api/v1/notifications/read": {
      post: {
        tags: ["notifications"],
        summary: "Mark all notifications read",
        security: signedIn,
        responses: { 200: { description: "Done" }, ...errors(401) },
      },
    },
    "/api/v1/favourites": {
      get: {
        tags: ["saved"],
        summary: "Your favourite aircraft",
        security: signedIn,
        responses: { ...ok(ref("Favourite"), true), ...errors(401) },
      },
    },
    "/api/v1/favourites/{aircraftId}": {
      put: {
        tags: ["saved"],
        summary: "Add an aircraft to your favourites",
        security: signedIn,
        parameters: [pathId("aircraftId", "Aircraft id (uuid)")],
        responses: { 200: { description: "Added" }, ...errors(401, 404) },
      },
      delete: {
        tags: ["saved"],
        summary: "Remove it",
        security: signedIn,
        parameters: [pathId("aircraftId", "Aircraft id (uuid)")],
        responses: { 200: { description: "Removed" }, ...errors(401) },
      },
    },
    "/api/v1/saved-searches": {
      get: {
        tags: ["saved"],
        summary: "Your saved searches",
        security: signedIn,
        responses: { ...ok(ref("SavedSearch"), true), ...errors(401) },
      },
      post: {
        tags: ["saved"],
        summary: "Save a search; alerts tell about aircraft that newly match, once a day",
        security: signedIn,
        requestBody: jsonBody(savedSearchBody),
        responses: { ...created("SavedSearch"), ...errors(400, 401, 409) },
      },
    },
    "/api/v1/saved-searches/{id}": {
      patch: {
        tags: ["saved"],
        summary: "Switch its alerts on or off",
        security: signedIn,
        parameters: [pathId("id", "Saved search id (uuid)")],
        requestBody: jsonBody(savedSearchPatch),
        responses: { ...ok(ref("SavedSearch")), ...errors(400, 401, 404) },
      },
      delete: {
        tags: ["saved"],
        summary: "Remove it",
        security: signedIn,
        parameters: [pathId("id", "Saved search id (uuid)")],
        responses: { 200: { description: "Removed" }, ...errors(401, 404) },
      },
    },
  };
}
