import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// 1- we need to make sure that the webhook event is coming from Clerk
// 2- if so, we will listen for the "user.created" event
// 3- we will save the user to the database

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("Missing CLERK_WEBHOOK_SECRET environment variable");
    }

    // check headers
    const svix_id = request.headers.get("svix-id");
    const svix_signature = request.headers.get("svix-signature");
    const svix_timestamp = request.headers.get("svix-timestamp");

    if (!svix_id || !svix_signature || !svix_timestamp) {
      return new Response("Error occurred -- no svix headers", {
        status: 400,
      });
    }

    const payload = await request.json();
    const body = JSON.stringify(payload);

    const wh = new Webhook(webhookSecret);
    let evt;

    // verify webhook
    try {
      evt = wh.verify(body, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      });
    } catch (err) {
      console.error("Error verifying webhook:", err);
      return new Response("Error occurred", { status: 400 });
    }

    const eventType = evt.type;
    console.log("Webhook event received:", eventType);

    if (eventType === "user.created") {
      console.log("Processing user.created event for user:", evt.data.id);
      
      // Validate that evt.data exists and has required properties
      if (!evt.data || !evt.data.id) {
        console.log("Invalid user.created event data:", evt.data);
        return new Response("Invalid event data", { status: 400 });
      }
      
      const { id, email_addresses, first_name, last_name, image_url } =
        evt.data;

      // Check if email_addresses exists and has at least one email
      if (!email_addresses || email_addresses.length === 0) {
        console.log("No email addresses found for user:", id);
        return new Response("No email address found", { status: 400 });
      }

      const email = email_addresses[0].email_address;
      if (!email) {
        console.log("Email address is null or undefined for user:", id);
        return new Response("Invalid email address", { status: 400 });
      }

      const name = `${first_name || ""} ${last_name || ""}`.trim();

      try {
        const userId = await ctx.runMutation(api.users.createUser, {
          email,
          fullname: name || "User",
          image: image_url || "https://via.placeholder.com/150",
          clerkId: id,
          username: email.split("@")[0] || "user",
          bio: undefined, // Optional field
        });
        console.log("User created successfully via webhook:", userId);
      } catch (error) {
        console.log("Error creating user:", error);
        return new Response("Error creating user", { status: 500 });
      }
    }

    return new Response("Webhook processed successfully", { status: 200 });
  }),
});

export default http;
