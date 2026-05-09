// Cloudflare Pages Function — Send SMS via Semaphore API

export async function onRequestPost(context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    // Parse request body
    const { phone, message } = await context.request.json();

    // Validate required fields
    if (!phone || !message) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: phone and message",
        }),
        {
          status: 400,
          headers,
        },
      );
    }

    // Get Semaphore API Key from Cloudflare environment variables
    const apiKey = context.env.SEMAPHORE_API_KEY;

    // Check if API key exists
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Semaphore API key not configured",
        }),
        {
          status: 500,
          headers,
        },
      );
    }

    // Normalize Philippine mobile number
    // Example:
    // 09171234567 -> 639171234567
    let normalizedPhone = phone.trim();

    if (normalizedPhone.startsWith("0")) {
      normalizedPhone = "63" + normalizedPhone.substring(1);
    }

    // Create request body for Semaphore
    // IMPORTANT:
    // No sendername included
    // Semaphore will use default sender
    const params = new URLSearchParams({
      apikey: apiKey,
      number: normalizedPhone,
      message: message,
    });

    // Send SMS request to Semaphore
    const smsResponse = await fetch(
      "https://api.semaphore.co/api/v4/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    // Parse Semaphore response
    const data = await smsResponse.json();

    console.log("Semaphore Response:", data);

    // Handle Semaphore API errors
    if (!smsResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Semaphore API error",
          details: data,
        }),
        {
          status: 502,
          headers,
        },
      );
    }

    // Success response
    return new Response(
      JSON.stringify({
        success: true,
        message: "SMS sent successfully",
        data,
      }),
      {
        status: 200,
        headers,
      },
    );
  } catch (error) {
    console.error("SMS send error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to send SMS",
        details: error.message,
      }),
      {
        status: 500,
        headers,
      },
    );
  }
}

// Handle OPTIONS request for CORS
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}
