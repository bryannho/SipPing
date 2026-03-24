import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_SNOOZE_COUNT = 3;

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const results = { scheduled: 0, snoozed: 0, errors: [] as string[] };

    // ── PART 1: Process scheduled rules ──────────────────────
    const { data: rules, error: rulesError } = await supabase
      .from("scheduled_rules")
      .select(
        `
        id, trip_id, from_user_id, to_user_id, type,
        start_time, end_time, interval_minutes, timezone, last_fired_at,
        trips!inner(status)
      `
      )
      .eq("active", true)
      .eq("trips.status", "active");

    if (rulesError) throw rulesError;

    for (const rule of rules || []) {
      try {
        // Convert current time to the rule's timezone
        const nowInTz = new Date(
          now.toLocaleString("en-US", { timeZone: rule.timezone })
        );
        const currentTimeMinutes =
          nowInTz.getHours() * 60 + nowInTz.getMinutes();

        // Parse start_time and end_time (HH:MM:SS format from Postgres TIME)
        const [startH, startM] = rule.start_time.split(":").map(Number);
        const [endH, endM] = rule.end_time.split(":").map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        // Check if current time is within the rule's active window
        if (
          currentTimeMinutes < startMinutes ||
          currentTimeMinutes > endMinutes
        ) {
          continue;
        }

        // Idempotency: skip if not enough time has elapsed since last fire
        if (rule.last_fired_at) {
          const lastFired = new Date(rule.last_fired_at);
          const minutesSinceLastFire =
            (now.getTime() - lastFired.getTime()) / (1000 * 60);
          if (minutesSinceLastFire < rule.interval_minutes) {
            continue;
          }
        }

        // Create the ping
        const { data: newPing, error: pingError } = await supabase
          .from("drink_pings")
          .insert({
            trip_id: rule.trip_id,
            from_user_id: rule.from_user_id,
            to_user_id: rule.to_user_id,
            type: rule.type,
            status: "pending",
            scheduled_at: now.toISOString(),
          })
          .select("id")
          .single();

        if (pingError) {
          results.errors.push(`Rule ${rule.id}: ${pingError.message}`);
          continue;
        }

        // Update last_fired_at
        await supabase
          .from("scheduled_rules")
          .update({ last_fired_at: now.toISOString() })
          .eq("id", rule.id);

        // Send push notification to recipient
        await sendPushNotification(
          supabase,
          rule.to_user_id,
          rule.type,
          rule.from_user_id,
          false,
          newPing.id
        );

        results.scheduled++;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        results.errors.push(`Rule ${rule.id}: ${message}`);
      }
    }

    // ── PART 2: Process snoozed pings past their deadline ────
    const { data: snoozedPings, error: snoozedError } = await supabase
      .from("drink_pings")
      .select("id, trip_id, from_user_id, to_user_id, type, snooze_count, sender_note")
      .eq("status", "snoozed")
      .lt("snoozed_until", now.toISOString());

    if (snoozedError) throw snoozedError;

    for (const ping of snoozedPings || []) {
      try {
        if (ping.snooze_count >= MAX_SNOOZE_COUNT) {
          // Auto-decline after max snoozes
          await supabase
            .from("drink_pings")
            .update({
              status: "declined",
              response_note: "Auto-declined after maximum snoozes",
              responded_at: now.toISOString(),
            })
            .eq("id", ping.id);

          // Notify sender that it was auto-declined
          await sendPushNotification(
            supabase,
            ping.from_user_id,
            ping.type,
            ping.to_user_id,
            true // isDeclineNotification
          );
        } else {
          // Re-activate the ping
          await supabase
            .from("drink_pings")
            .update({
              status: "pending",
              snoozed_until: null,
            })
            .eq("id", ping.id);

          // Re-send push notification to recipient
          await sendPushNotification(
            supabase,
            ping.to_user_id,
            ping.type,
            ping.from_user_id,
            false,
            ping.id,
            ping.sender_note
          );
        }
        results.snoozed++;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        results.errors.push(`Snoozed ping ${ping.id}: ${message}`);
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ── Push notification helper ──────────────────────────────────

async function sendPushNotification(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  recipientUserId: string,
  drinkType: string,
  otherUserId: string,
  isDeclineNotification = false,
  pingId: string | null = null,
  senderNote: string | null = null
) {
  // Get recipient's push token
  const { data: recipient } = await supabase
    .from("users")
    .select("expo_push_token, name")
    .eq("id", recipientUserId)
    .single();

  if (!recipient?.expo_push_token) return;

  // Get the other user's name
  const { data: otherUser } = await supabase
    .from("users")
    .select("name")
    .eq("id", otherUserId)
    .single();

  const otherName = otherUser?.name || "Someone";

  let title: string;
  let body: string;

  if (isDeclineNotification) {
    title = "Ping auto-declined";
    body = `${otherName} snoozed too many times — their ${drinkType} ping was auto-declined.`;
  } else {
    const emoji = drinkType === "water" ? "\u{1F4A7}" : "\u{1F943}";
    const drinkLabel = drinkType === "water" ? "water" : "a shot";
    title = `${emoji} Drink Ping!`;
    body = senderNote
      ? `${otherName}: ${senderNote}`
      : `${otherName} wants you to drink ${drinkLabel}!`;
  }

  const message = {
    to: recipient.expo_push_token,
    sound: "default",
    title,
    body,
    data: { type: "drink_ping", drinkType, pingId },
    categoryId: "drink_ping", // iOS notification category for action buttons
  };

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  const result = await response.json();

  // Handle invalid push tokens
  if (result.data?.[0]?.status === "error") {
    const errorDetails = result.data[0].details;
    if (errorDetails?.error === "DeviceNotRegistered") {
      // Clear the invalid token so we don't keep trying
      await supabase
        .from("users")
        .update({ expo_push_token: null })
        .eq("id", recipientUserId);
    }
  }
}
