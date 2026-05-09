// Cloudflare Pages Function — Send SMS via Semaphore API

export async function onRequestPost(context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    const { phone, message } = await context.request.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: phone, message" }),
        {
          status: 400,
          headers,
        },
      );
    }

    const apiKey = context.env.SEMAPHORE_API_KEY;
    const senderName = context.env.SEMAPHORE_SENDER_NAME || "4JLaundry";

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Semaphore API key not configured" }),
        {
          status: 500,
          headers,
        },
      );
    }

    const normalizedPhone = phone.startsWith("0")
      ? "63" + phone.substring(1)
      : phone;

    const params = new URLSearchParams({
      apikey: apiKey,
      number: normalizedPhone,
      message: message,
      sendername: senderName,
    });

    const smsRes = await fetch("https://api.semaphore.co/api/v4/messages", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await smsRes.json();

    if (!smsRes.ok) {
      return new Response(
        JSON.stringify({ error: "Semaphore API error", details: data }),
        {
          status: 502,
          headers,
        },
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "SMS sent successfully", data }),
      {
        status: 200,
        headers,
      },
    );
  } catch (error) {
    console.error("SMS send error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send SMS", details: error.message }),
      {
        status: 500,
        headers,
      },
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}
